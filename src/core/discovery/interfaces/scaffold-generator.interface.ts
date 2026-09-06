/**
 * Interface for Plugin & Workflow Scaffold Generator
 */

import type {
  DiscoveryReport,
  PluginScaffoldArtifact,
  WorkflowScaffoldArtifact,
  SelectorMapArtifact,
} from '../types.js';

export interface IScaffoldGenerator {
  /**
   * Generates a fully typed TypeScript plugin scaffold from discovery findings.
   */
  generatePluginScaffold(report: DiscoveryReport): PluginScaffoldArtifact;

  /**
   * Generates a platform workflow definition JSON & schema.
   */
  generateWorkflowScaffold(report: DiscoveryReport): WorkflowScaffoldArtifact;

  /**
   * Generates a JSON/YAML selector configuration file.
   */
  generateSelectorMap(report: DiscoveryReport): SelectorMapArtifact;

  /**
   * Generates a comprehensive markdown documentation artifact for developers.
   */
  generateMarkdownDoc(report: DiscoveryReport): string;
}
