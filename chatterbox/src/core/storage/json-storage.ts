import { writeFileSync, renameSync, copyFileSync, unlinkSync, mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Task, TaskSchema } from '../models/task.js';
import { TaskNode, TaskNodeSchema } from '../models/task-node.js';
import { Agent, AgentSchema } from '../models/agent.js';
import { Message, MessageSchema } from '../models/message.js';
import { Artifact, ArtifactSchema } from '../models/artifact.js';
import { Approval, ApprovalSchema } from '../models/approval.js';
import { UsageRecord, UsageRecordSchema } from '../models/usage.js';
import { ProposedChangeset, ProposedChangesetSchema } from '../agents/schemas/coding-schemas.js';
import { TaskStatus, TaskNodeStatus, ApprovalStatus, AgentRole } from '../models/enums.js';
import { getTimestamp } from '../../utils/time.js';

export function atomicWriteFileSync(filePath: string, content: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tmpPath = join(dir, `.${basename(filePath)}.tmp.${Date.now()}.${randomUUID().slice(0, 8)}`);
  writeFileSync(tmpPath, content, 'utf-8');
  try {
    renameSync(tmpPath, filePath);
  } catch {
    copyFileSync(tmpPath, filePath);
    try {
      unlinkSync(tmpPath);
    } catch {
      // Ignore temporary file removal error
    }
  }
}

export function readJsonlFileSync<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  const items: T[] = [];
  for (const line of lines) {
    try {
      items.push(JSON.parse(line));
    } catch {
      // Ignore corrupted or unparseable JSON line
    }
  }
  return items;
}

export function appendJsonlFileSync<T>(filePath: string, item: T): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  appendFileSync(filePath, JSON.stringify(item) + '\n', 'utf-8');
}

export function rewriteJsonlFileSync<T>(filePath: string, items: T[]): void {
  const content = items.map((i) => JSON.stringify(i)).join('\n') + (items.length > 0 ? '\n' : '');
  atomicWriteFileSync(filePath, content);
}

export class JsonStorageAdapter {
  readonly isMemory: boolean;
  readonly baseDir: string;

  // In-memory collections for :memory: mode
  private memTasks = new Map<string, Task>();
  private memTaskNodes = new Map<string, TaskNode>();
  private memAgents = new Map<string, Agent>();
  private memMessages: Message[] = [];
  private memArtifacts = new Map<string, Artifact>();
  private memApprovals = new Map<string, Approval>();
  private memUsage: UsageRecord[] = [];
  private memChangesets = new Map<string, ProposedChangeset>();

  constructor(targetPath: string) {
    if (targetPath === ':memory:') {
      this.isMemory = true;
      this.baseDir = ':memory:';
    } else {
      this.isMemory = false;
      // If path points to a file like 'local.db', use its parent folder (.chatterbox)
      if (targetPath.endsWith('.db') || targetPath.endsWith('.sqlite')) {
        this.baseDir = dirname(targetPath);
      } else {
        this.baseDir = targetPath;
      }
      if (!existsSync(this.baseDir)) {
        mkdirSync(this.baseDir, { recursive: true });
      }
    }
  }

  // File paths
  private get tasksFile(): string { return join(this.baseDir, 'tasks.jsonl'); }
  private get taskNodesFile(): string { return join(this.baseDir, 'task-nodes.jsonl'); }
  private get agentsFile(): string { return join(this.baseDir, 'agents.json'); }
  private get messagesFile(): string { return join(this.baseDir, 'messages.jsonl'); }
  private get artifactsFile(): string { return join(this.baseDir, 'artifacts.jsonl'); }
  private get approvalsFile(): string { return join(this.baseDir, 'approvals.jsonl'); }
  private get usageFile(): string { return join(this.baseDir, 'usage.jsonl'); }
  private get changesetsFile(): string { return join(this.baseDir, 'changesets.jsonl'); }

  // --------------------------------------------------------------------------
  // Tasks
  // --------------------------------------------------------------------------
  async createTask(task: Task): Promise<Task> {
    const validated = TaskSchema.parse(task);
    if (this.isMemory) {
      this.memTasks.set(validated.id, validated);
    } else {
      appendJsonlFileSync(this.tasksFile, validated);
    }
    return validated;
  }

  async getTaskById(id: string): Promise<Task | null> {
    if (this.isMemory) {
      return this.memTasks.get(id) ?? null;
    }
    const all = readJsonlFileSync<Task>(this.tasksFile);
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].id === id) {
        return TaskSchema.parse(all[i]);
      }
    }
    return null;
  }

  async listTasks(limit = 20, offset = 0): Promise<Task[]> {
    let all: Task[];
    if (this.isMemory) {
      all = Array.from(this.memTasks.values());
    } else {
      all = readJsonlFileSync<Task>(this.tasksFile);
    }
    all.sort((a, b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0));
    return all.slice(offset, offset + limit).map((t) => TaskSchema.parse(t));
  }

  async updateTaskStatus(id: string, status: TaskStatus): Promise<Task | null> {
    const updatedAt = getTimestamp();
    return this.updateTask(id, { status, updatedAt });
  }

  async updateTask(id: string, patch: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task | null> {
    const updatedAt = getTimestamp();
    if (this.isMemory) {
      const existing = this.memTasks.get(id);
      if (!existing) return null;
      const updated = TaskSchema.parse({ ...existing, ...patch, updatedAt });
      this.memTasks.set(id, updated);
      return updated;
    }
    const all = readJsonlFileSync<Task>(this.tasksFile);
    const index = all.findIndex((t) => t.id === id);
    if (index === -1) return null;
    const updated = TaskSchema.parse({ ...all[index], ...patch, updatedAt });
    all[index] = updated;
    rewriteJsonlFileSync(this.tasksFile, all);
    return updated;
  }

  // --------------------------------------------------------------------------
  // Task Nodes
  // --------------------------------------------------------------------------
  async createTaskNodes(nodes: TaskNode[]): Promise<TaskNode[]> {
    if (nodes.length === 0) return [];
    const validated = nodes.map((n) => TaskNodeSchema.parse(n));
    if (this.isMemory) {
      for (const node of validated) {
        this.memTaskNodes.set(node.id, node);
      }
    } else {
      for (const node of validated) {
        appendJsonlFileSync(this.taskNodesFile, node);
      }
    }
    return validated;
  }

  async listTaskNodesByTaskId(taskId: string): Promise<TaskNode[]> {
    let all: TaskNode[];
    if (this.isMemory) {
      all = Array.from(this.memTaskNodes.values());
    } else {
      all = readJsonlFileSync<TaskNode>(this.taskNodesFile);
    }
    return all.filter((n) => n.taskId === taskId).map((n) => TaskNodeSchema.parse(n));
  }

  async getTaskNodeById(id: string): Promise<TaskNode | null> {
    if (this.isMemory) {
      return this.memTaskNodes.get(id) ?? null;
    }
    const all = readJsonlFileSync<TaskNode>(this.taskNodesFile);
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].id === id) {
        return TaskNodeSchema.parse(all[i]);
      }
    }
    return null;
  }

  async updateTaskNodeStatus(id: string, status: TaskNodeStatus): Promise<TaskNode | null> {
    const updatedAt = getTimestamp();
    return this.updateTaskNode(id, { status, updatedAt });
  }

  async updateTaskNodeOutputArtifactId(id: string, outputArtifactId: string): Promise<TaskNode | null> {
    const updatedAt = getTimestamp();
    return this.updateTaskNode(id, { outputArtifactId, updatedAt });
  }

  async updateTaskNode(id: string, patch: Partial<Omit<TaskNode, 'id' | 'taskId' | 'createdAt'>>): Promise<TaskNode | null> {
    const updatedAt = getTimestamp();
    if (this.isMemory) {
      const existing = this.memTaskNodes.get(id);
      if (!existing) return null;
      const updated = TaskNodeSchema.parse({ ...existing, ...patch, updatedAt });
      this.memTaskNodes.set(id, updated);
      return updated;
    }
    const all = readJsonlFileSync<TaskNode>(this.taskNodesFile);
    const index = all.findIndex((n) => n.id === id);
    if (index === -1) return null;
    const updated = TaskNodeSchema.parse({ ...all[index], ...patch, updatedAt });
    all[index] = updated;
    rewriteJsonlFileSync(this.taskNodesFile, all);
    return updated;
  }

  async deleteTaskNode(id: string): Promise<void> {
    if (this.isMemory) {
      this.memTaskNodes.delete(id);
    } else {
      const all = readJsonlFileSync<TaskNode>(this.taskNodesFile);
      const filtered = all.filter((n) => n.id !== id);
      rewriteJsonlFileSync(this.taskNodesFile, filtered);
    }
  }

  async deleteTaskNodesByTaskId(taskId: string): Promise<void> {
    if (this.isMemory) {
      for (const [id, node] of this.memTaskNodes.entries()) {
        if (node.taskId === taskId) {
          this.memTaskNodes.delete(id);
        }
      }
    } else {
      const all = readJsonlFileSync<TaskNode>(this.taskNodesFile);
      const filtered = all.filter((n) => n.taskId !== taskId);
      rewriteJsonlFileSync(this.taskNodesFile, filtered);
    }
  }

  // --------------------------------------------------------------------------
  // Agents
  // --------------------------------------------------------------------------
  async createAgent(agent: Agent): Promise<Agent> {
    const validated = AgentSchema.parse(agent);
    if (this.isMemory) {
      this.memAgents.set(validated.id, validated);
    } else {
      const all = this.listAgentsSync();
      const existingIdx = all.findIndex((a) => a.id === validated.id);
      if (existingIdx !== -1) {
        all[existingIdx] = validated;
      } else {
        all.push(validated);
      }
      atomicWriteFileSync(this.agentsFile, JSON.stringify(all, null, 2));
    }
    return validated;
  }

  private listAgentsSync(): Agent[] {
    if (this.isMemory) {
      return Array.from(this.memAgents.values());
    }
    if (!existsSync(this.agentsFile)) return [];
    try {
      const parsed = JSON.parse(readFileSync(this.agentsFile, 'utf-8'));
      return Array.isArray(parsed) ? parsed.map((a) => AgentSchema.parse(a)) : [];
    } catch {
      return [];
    }
  }

  async listAgents(): Promise<Agent[]> {
    return this.listAgentsSync();
  }

  async getAgentById(id: string): Promise<Agent | null> {
    if (this.isMemory) {
      return this.memAgents.get(id) ?? null;
    }
    const all = this.listAgentsSync();
    return all.find((a) => a.id === id) ?? null;
  }

  async getAgentByRole(role: AgentRole): Promise<Agent | null> {
    if (this.isMemory) {
      for (const agent of this.memAgents.values()) {
        if (agent.role === role) return agent;
      }
      return null;
    }
    const all = this.listAgentsSync();
    return all.find((a) => a.role === role) ?? null;
  }

  // --------------------------------------------------------------------------
  // Messages
  // --------------------------------------------------------------------------
  async createMessage(message: Message): Promise<Message> {
    const validated = MessageSchema.parse(message);
    if (this.isMemory) {
      this.memMessages.push(validated);
    } else {
      appendJsonlFileSync(this.messagesFile, validated);
    }
    return validated;
  }

  async listMessagesByTaskId(taskId: string, limit = 100, offset = 0): Promise<Message[]> {
    let all: Message[];
    if (this.isMemory) {
      all = this.memMessages;
    } else {
      all = readJsonlFileSync<Message>(this.messagesFile);
    }
    const filtered = all.filter((m) => m.taskId === taskId);
    filtered.sort((a, b) => (a.createdAt > b.createdAt ? 1 : a.createdAt < b.createdAt ? -1 : 0));
    return filtered.slice(offset, offset + limit).map((m) => MessageSchema.parse(m));
  }

  // --------------------------------------------------------------------------
  // Artifacts
  // --------------------------------------------------------------------------
  async createArtifact(artifact: Artifact): Promise<Artifact> {
    const validated = ArtifactSchema.parse(artifact);
    if (this.isMemory) {
      this.memArtifacts.set(validated.id, validated);
    } else {
      appendJsonlFileSync(this.artifactsFile, validated);
    }
    return validated;
  }

  async listArtifactsByTaskId(taskId: string): Promise<Artifact[]> {
    let all: Artifact[];
    if (this.isMemory) {
      all = Array.from(this.memArtifacts.values());
    } else {
      all = readJsonlFileSync<Artifact>(this.artifactsFile);
    }
    const filtered = all.filter((a) => a.taskId === taskId);
    filtered.sort((a, b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0));
    return filtered.map((a) => ArtifactSchema.parse(a));
  }

  async getArtifactById(id: string): Promise<Artifact | null> {
    if (this.isMemory) {
      return this.memArtifacts.get(id) ?? null;
    }
    const all = readJsonlFileSync<Artifact>(this.artifactsFile);
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].id === id) {
        return ArtifactSchema.parse(all[i]);
      }
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // Approvals
  // --------------------------------------------------------------------------
  async createApproval(approval: Approval): Promise<Approval> {
    const validated = ApprovalSchema.parse(approval);
    if (this.isMemory) {
      this.memApprovals.set(validated.id, validated);
    } else {
      appendJsonlFileSync(this.approvalsFile, validated);
    }
    return validated;
  }

  async getPendingApprovalsByTaskId(taskId: string): Promise<Approval[]> {
    let all: Approval[];
    if (this.isMemory) {
      all = Array.from(this.memApprovals.values());
    } else {
      all = readJsonlFileSync<Approval>(this.approvalsFile);
    }
    return all
      .filter((a) => a.taskId === taskId && a.status === 'pending')
      .map((a) => ApprovalSchema.parse(a));
  }

  async listApprovalsByTaskId(taskId: string): Promise<Approval[]> {
    let all: Approval[];
    if (this.isMemory) {
      all = Array.from(this.memApprovals.values());
    } else {
      all = readJsonlFileSync<Approval>(this.approvalsFile);
    }
    return all.filter((a) => a.taskId === taskId).map((a) => ApprovalSchema.parse(a));
  }

  async getApprovalById(id: string): Promise<Approval | null> {
    if (this.isMemory) {
      return this.memApprovals.get(id) ?? null;
    }
    const all = readJsonlFileSync<Approval>(this.approvalsFile);
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].id === id) {
        return ApprovalSchema.parse(all[i]);
      }
    }
    return null;
  }

  async updateApprovalStatus(id: string, status: ApprovalStatus, reason?: string): Promise<Approval | null> {
    const decidedAt = getTimestamp();
    if (this.isMemory) {
      const existing = this.memApprovals.get(id);
      if (!existing) return null;
      const updated = ApprovalSchema.parse({ ...existing, status, reason: reason ?? existing.reason, decidedAt });
      this.memApprovals.set(id, updated);
      return updated;
    }
    const all = readJsonlFileSync<Approval>(this.approvalsFile);
    const index = all.findIndex((a) => a.id === id);
    if (index === -1) return null;
    const updated = ApprovalSchema.parse({
      ...all[index],
      status,
      reason: reason ?? all[index].reason,
      decidedAt,
    });
    all[index] = updated;
    rewriteJsonlFileSync(this.approvalsFile, all);
    return updated;
  }

  // --------------------------------------------------------------------------
  // Usage Records
  // --------------------------------------------------------------------------
  async createUsageRecord(record: UsageRecord): Promise<UsageRecord> {
    const validated = UsageRecordSchema.parse(record);
    if (this.isMemory) {
      this.memUsage.push(validated);
    } else {
      appendJsonlFileSync(this.usageFile, validated);
    }
    return validated;
  }

  async listUsageByTaskId(taskId: string): Promise<UsageRecord[]> {
    let all: UsageRecord[];
    if (this.isMemory) {
      all = this.memUsage;
    } else {
      all = readJsonlFileSync<UsageRecord>(this.usageFile);
    }
    const filtered = all.filter((u) => u.taskId === taskId);
    filtered.sort((a, b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0));
    return filtered.map((u) => UsageRecordSchema.parse(u));
  }

  // --------------------------------------------------------------------------
  // Changesets
  // --------------------------------------------------------------------------
  async createChangeset(changeset: ProposedChangeset): Promise<ProposedChangeset> {
    const validated = ProposedChangesetSchema.parse(changeset);
    if (this.isMemory) {
      this.memChangesets.set(validated.id, validated);
    } else {
      appendJsonlFileSync(this.changesetsFile, validated);
    }
    return validated;
  }

  async getChangesetById(id: string): Promise<ProposedChangeset | null> {
    if (this.isMemory) {
      return this.memChangesets.get(id) ?? null;
    }
    const all = readJsonlFileSync<ProposedChangeset>(this.changesetsFile);
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].id === id) {
        return ProposedChangesetSchema.parse(all[i]);
      }
    }
    return null;
  }

  async getChangesetByNodeId(nodeId: string): Promise<ProposedChangeset | null> {
    if (this.isMemory) {
      for (const cs of this.memChangesets.values()) {
        if (cs.nodeId === nodeId) return cs;
      }
      return null;
    }
    const all = readJsonlFileSync<ProposedChangeset>(this.changesetsFile);
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].nodeId === nodeId) {
        return ProposedChangesetSchema.parse(all[i]);
      }
    }
    return null;
  }

  async listChangesetsByTaskId(taskId: string): Promise<ProposedChangeset[]> {
    let all: ProposedChangeset[];
    if (this.isMemory) {
      all = Array.from(this.memChangesets.values());
    } else {
      all = readJsonlFileSync<ProposedChangeset>(this.changesetsFile);
    }
    return all.filter((cs) => cs.taskId === taskId).map((cs) => ProposedChangesetSchema.parse(cs));
  }

  async updateChangeset(changeset: ProposedChangeset): Promise<ProposedChangeset> {
    const validated = ProposedChangesetSchema.parse({
      ...changeset,
      updatedAt: getTimestamp(),
    });
    if (this.isMemory) {
      this.memChangesets.set(validated.id, validated);
      return validated;
    }
    const all = readJsonlFileSync<ProposedChangeset>(this.changesetsFile);
    const index = all.findIndex((cs) => cs.id === validated.id);
    if (index !== -1) {
      all[index] = validated;
    } else {
      all.push(validated);
    }
    rewriteJsonlFileSync(this.changesetsFile, all);
    return validated;
  }
}
