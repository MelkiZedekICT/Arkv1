import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { isAbsolute, normalize, resolve, dirname } from 'path';
import { Artifact, ArtifactSchema } from '../models/artifact.js';
import { ArtifactType } from '../models/enums.js';
import { ArtifactRepository } from '../storage/repositories/artifact.repository.js';
import { EventBus } from '../events/event-bus.js';
import { LocalSandboxService } from '../security/sandbox/local-sandbox.service.js';
import { generateId } from '../../utils/ids.js';
import { getTimestamp } from '../../utils/time.js';

export interface CreateArtifactOptions {
  taskId: string;
  nodeId?: string;
  authorId: string;
  type: ArtifactType;
  title: string;
  filename?: string;
  content: string;
  correlationId?: string;
}

export class ArtifactService {
  private artifactsBaseDir: string;
  private sandbox?: LocalSandboxService;

  constructor(
    baseStorageDir: string,
    private artifactRepo: ArtifactRepository,
    private eventBus: EventBus,
    sandbox?: LocalSandboxService
  ) {
    this.artifactsBaseDir = resolve(baseStorageDir, 'artifacts');
    this.sandbox = sandbox;
    mkdirSync(this.artifactsBaseDir, { recursive: true });
  }

  setSandbox(sandbox: LocalSandboxService): void {
    this.sandbox = sandbox;
  }

  getTaskArtifactsDir(taskId: string): string {
    const safeTaskId = this.sanitizePathComponent(taskId);
    const taskDir = resolve(this.artifactsBaseDir, safeTaskId);
    this.assertWithinBase(taskDir, this.artifactsBaseDir);
    mkdirSync(taskDir, { recursive: true });
    return taskDir;
  }

  resolveSafeArtifactPath(taskId: string, filename: string): string {
    if (this.sandbox) {
      return this.sandbox.assertPathWithinTaskDirectory(filename, taskId);
    }
    const taskDir = this.getTaskArtifactsDir(taskId);
    const safeFilename = this.sanitizePathComponent(filename);
    const fullPath = resolve(taskDir, safeFilename);
    this.assertWithinBase(fullPath, taskDir);
    return fullPath;
  }

  async createArtifact(options: CreateArtifactOptions): Promise<Artifact> {
    const { taskId, nodeId, authorId, type, title, content } = options;
    const defaultExt = type === 'markdown' ? '.md' : type === 'json' ? '.json' : '.txt';
    const fallbackFilename = `${this.slugify(title)}${defaultExt}`;
    const filename = options.filename || fallbackFilename;

    const fullPath = this.resolveSafeArtifactPath(taskId, filename);
    mkdirSync(dirname(fullPath), { recursive: true });

    // Atomicity: Write to a staging temporary file first
    const tempPath = `${fullPath}.tmp.${generateId('tmp')}`;
    try {
      writeFileSync(tempPath, content, 'utf-8');

      // Create database model
      const artifactId = generateId('art');
      const artifact: Artifact = ArtifactSchema.parse({
        id: artifactId,
        taskId,
        nodeId,
        authorId,
        type,
        title,
        path: fullPath,
        createdAt: getTimestamp(),
      });

      // Insert record into repository
      await this.artifactRepo.create(artifact);

      // Atomically commit file by renaming temp to target
      renameSync(tempPath, fullPath);

      // Update sandbox budget
      if (this.sandbox) {
        this.sandbox.recordArtifact(taskId);
      }

      // Emit artifact_created event
      await this.eventBus.publish({
        eventId: generateId('evt'),
        taskId,
        nodeId,
        type: 'artifact_created',
        timestamp: getTimestamp(),
        actorType: 'agent',
        actorId: authorId,
        correlationId: options.correlationId || generateId('corr'),
        payload: {
          artifactId,
          nodeId,
          title,
          type,
          path: fullPath,
        },
      });

      return artifact;
    } catch (err) {
      // Clean up temporary staging file on failure so partially written artifacts never leak
      if (existsSync(tempPath)) {
        try {
          unlinkSync(tempPath);
        } catch {
          // ignore cleanup error
        }
      }
      throw err;
    }
  }

  async readArtifactContent(artifactId: string): Promise<string> {
    const artifact = await this.artifactRepo.getById(artifactId);
    if (!artifact) {
      throw new Error(`Artifact with ID "${artifactId}" not found in repository.`);
    }

    this.assertWithinBase(resolve(artifact.path), this.artifactsBaseDir);

    if (!existsSync(artifact.path)) {
      throw new Error(`Artifact file missing at "${artifact.path}".`);
    }

    return readFileSync(artifact.path, 'utf-8');
  }

  async readArtifactByPath(safePath: string, taskId?: string): Promise<string> {
    const resolved = resolve(safePath);
    if (taskId) {
      const taskDir = this.getTaskArtifactsDir(taskId);
      this.assertWithinBase(resolved, taskDir);
    } else {
      this.assertWithinBase(resolved, this.artifactsBaseDir);
    }

    if (!existsSync(resolved)) {
      throw new Error(`Artifact file missing at "${resolved}".`);
    }

    return readFileSync(resolved, 'utf-8');
  }

  async getArtifact(artifactId: string): Promise<Artifact | null> {
    return this.artifactRepo.getById(artifactId);
  }

  async listArtifacts(taskId: string): Promise<Artifact[]> {
    return this.artifactRepo.listByTaskId(taskId);
  }

  private sanitizePathComponent(component: string): string {
    if (!component || typeof component !== 'string') {
      throw new Error('Path component must be a non-empty string.');
    }

    // Disallow path traversal attempts
    if (
      component.includes('..') ||
      component.includes('/') ||
      component.includes('\\') ||
      isAbsolute(component)
    ) {
      throw new Error(`Path traversal attempt detected in component: "${component}"`);
    }

    const cleaned = component.trim();
    if (!/^[a-zA-Z0-9._-]+$/.test(cleaned)) {
      throw new Error(`Invalid characters in path component: "${component}"`);
    }

    return cleaned;
  }

  private assertWithinBase(targetPath: string, baseDir: string): void {
    const normalizedTarget = normalize(resolve(targetPath)).toLowerCase();
    const normalizedBase = normalize(resolve(baseDir)).toLowerCase();

    if (!normalizedTarget.startsWith(normalizedBase)) {
      throw new Error(
        `Path traversal violation: Target "${targetPath}" resolves outside allowed directory "${baseDir}".`
      );
    }
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'artifact';
  }
}
