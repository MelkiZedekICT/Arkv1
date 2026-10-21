import { DefaultToolRegistry } from './tool-registry.js';
import { MockWebSearchTool } from './mock/mock-web-search.tool.js';
import { ReadArtifactTool } from './mock/read-artifact.tool.js';
import { CreateMarkdownArtifactTool } from './mock/create-markdown-artifact.tool.js';
import { ReadFileTool } from './workspace/read-file.tool.js';
import { SearchWorkspaceTool } from './workspace/search-workspace.tool.js';
import { ListDirectoryTool } from './workspace/list-directory.tool.js';
import { CreateFolderTool } from './workspace/create-folder.tool.js';
import { CreateFileTool } from './workspace/create-file.tool.js';
import { EditFileTool } from './workspace/edit-file.tool.js';
import { DeleteFileTool } from './workspace/delete-file.tool.js';
import { RunCommandTool } from './workspace/run-command.tool.js';
import { ToolRegistry } from './tool.interface.js';

export * from './tool.interface.js';
export * from './tool-registry.js';
export * from './mock/mock-web-search.tool.js';
export * from './mock/read-artifact.tool.js';
export * from './mock/create-markdown-artifact.tool.js';
export * from './workspace/read-file.tool.js';
export * from './workspace/search-workspace.tool.js';
export * from './workspace/list-directory.tool.js';
export * from './workspace/create-folder.tool.js';
export * from './workspace/create-file.tool.js';
export * from './workspace/edit-file.tool.js';
export * from './workspace/delete-file.tool.js';
export * from './workspace/run-command.tool.js';

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new DefaultToolRegistry();
  registry.register(new MockWebSearchTool());
  registry.register(new ReadArtifactTool());
  registry.register(new CreateMarkdownArtifactTool());
  registry.register(new ReadFileTool());
  registry.register(new SearchWorkspaceTool());
  registry.register(new ListDirectoryTool());
  registry.register(new CreateFolderTool());
  registry.register(new CreateFileTool());
  registry.register(new EditFileTool());
  registry.register(new DeleteFileTool());
  registry.register(new RunCommandTool());
  return registry;
}
