/**
 * PipelineCodeLensProvider - Code lenses for pipeline.yaml stages
 *
 * Provides CodeLens implementations for pipeline.yaml:
 * - Stage info: Stage N/total | Agent: X | Skill: Y
 * - Goto actions: passed->stage, failed->stage, default->stage
 *
 * Features:
 * - Parse YAML via loadYaml
 * - Find stage positions via regex
 * - Support both object and string goto formats
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { load as loadYaml } from 'js-yaml';

interface PipelineConfig {
  pipeline?: {
    stages?: Record<string, StageConfig>;
  };
}

interface StageConfig {
  description?: string;
  agent?: string;
  fallback_agent?: string;
  skill?: string;
  goto?: Record<string, GotoTarget>;
}

type GotoTarget = string | { stage: string; params?: Record<string, unknown> };

/**
 * CodeLensProvider for pipeline.yaml files
 */
export class PipelineCodeLensProvider implements vscode.CodeLensProvider {
  private workflowRoot: string | null = null;
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root: string): void {
    this.workflowRoot = root;
  }

  /**
   * Refresh code lenses when pipeline.yaml changes
   */
  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  /**
   * Provide CodeLenses for a pipeline.yaml file
   */
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!this.workflowRoot) {
      return [];
    }

    const fileName = path.basename(document.fileName);
    if (fileName !== 'pipeline.yaml') {
      return [];
    }

    const content = document.getText();
    const lenses: vscode.CodeLens[] = [];

    try {
      const config = loadYaml(content) as PipelineConfig;

      if (!config?.pipeline?.stages) {
        return lenses;
      }

      const stages = config.pipeline.stages;
      const stageIds = Object.keys(stages);
      const totalStages = stageIds.length;

      // Process each stage
      stageIds.forEach((stageId, index) => {
        const stage = stages[stageId];
        if (!stage) {
          return;
        }

        // Find stage position in document
        const stagePosition = this.findStagePosition(content, stageId);
        if (!stagePosition) {
          return;
        }

        // Create Stage info CodeLens
        const stageInfoLens = this.createStageInfoLens(
          stagePosition,
          stageId,
          index + 1,
          totalStages,
          stage
        );
        if (stageInfoLens) {
          lenses.push(stageInfoLens);
        }

        // Create Goto CodeLens
        const gotoLenses = this.createGotoLenses(stagePosition, stage);
        lenses.push(...gotoLenses);
      });
    } catch (error) {
      // YAML parsing failed - no lenses
      console.error('Failed to parse pipeline.yaml for code lenses:', error);
    }

    return lenses;
  }

  /**
   * Find the line number where a stage is defined
   * Uses regex to match stage-id: pattern
   */
  private findStagePosition(
    content: string,
    stageId: string
  ): vscode.Position | null {
    // Escape special regex characters in stageId
    const escapedStageId = stageId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Match stage definition: stage-id: (with optional leading whitespace)
    // Stage definitions start with 4 spaces (indent level 1)
    const stageRegex = new RegExp(`^\\s{4}${escapedStageId}:\\s*$`, 'm');
    const match = stageRegex.exec(content);
    
    if (!match) {
      return null;
    }

    // Calculate line number from match index
    const textBeforeMatch = content.substring(0, match.index);
    const lineNumber = (textBeforeMatch.match(/\n/g) || []).length;
    
    return new vscode.Position(lineNumber, 0);
  }

  /**
   * Create CodeLens with stage info
   * Format: Stage N/total | Agent: X | Skill: Y
   */
  private createStageInfoLens(
    position: vscode.Position,
    stageId: string,
    stageNum: number,
    totalStages: number,
    stage: StageConfig
  ): vscode.CodeLens | null {
    const range = new vscode.Range(position, position);
    
    const agent = stage.agent || stage.fallback_agent || 'N/A';
    const skill = stage.skill || 'N/A';
    
    const title = `Stage ${stageNum}/${totalStages} | Agent: ${agent} | Skill: ${skill}`;

    const command: vscode.Command = {
      title,
      command: 'workflow.focusPipelineStage',
      arguments: [stageId]
    };

    return new vscode.CodeLens(range, command);
  }

  /**
   * Create Goto CodeLenses for stage transitions
   * Format: Goto: passed->stage, failed->stage, default->stage
   */
  private createGotoLenses(
    position: vscode.Position,
    stage: StageConfig
  ): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    
    const goto = stage.goto;
    if (!goto) {
      return lenses;
    }

    const range = new vscode.Range(position, position);
    const transitions: string[] = [];

    // Process each goto target
    Object.entries(goto).forEach(([status, target]) => {
      const targetStage = this.extractTargetStage(target);
      if (targetStage) {
        transitions.push(`${status}->${targetStage}`);
      }
    });

    if (transitions.length === 0) {
      return lenses;
    }

    const title = `Goto: ${transitions.join(', ')}`;

    const command: vscode.Command = {
      title,
      command: 'workflow.focusPipelineStage',
      arguments: [Object.keys(goto)[0]]
    };

    lenses.push(new vscode.CodeLens(range, command));

    return lenses;
  }

  /**
   * Extract target stage from goto configuration
   * Supports both string and object formats:
   * - String: "stage-id"
   * - Object: { stage: "stage-id", params: {...} }
   */
  private extractTargetStage(target: GotoTarget): string | null {
    if (typeof target === 'string') {
      return target;
    }

    if (typeof target === 'object' && target !== null) {
      return target.stage || null;
    }

    return null;
  }
}
