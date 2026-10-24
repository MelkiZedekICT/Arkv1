import { MissionRecord } from './types.js';
import { MissionLedger } from './mission-ledger.js';

export class LedgerExporter {
  static exportJson(mission: MissionRecord): string {
    const verification = MissionLedger.verifyMission(mission);
    const enriched = {
      ...mission,
      _verification_report: verification,
    };
    return JSON.stringify(enriched, null, 2);
  }

  static exportMarkdown(mission: MissionRecord): string {
    const verification = MissionLedger.verifyMission(mission);
    const sealBadge =
      verification.status === 'VERIFIED'
        ? '✓ VERIFIED (Ed25519 Cryptographic Seal Valid)'
        : verification.status === 'TAMPERED'
        ? '✗ TAMPERED (Integrity Violations Detected)'
        : '○ UNVERIFIABLE (No Local Cryptographic Seal)';

    const lines: string[] = [];
    lines.push(`# Chatterbox Mission Audit Report: ${mission.goal}`);
    lines.push('');
    lines.push(`- **Mission ID:** \`${mission.mission_id}\` (${mission.display_id})`);
    lines.push(`- **Status:** **${mission.status.toUpperCase()}**`);
    lines.push(`- **Workspace Root:** \`${mission.workspace_root}\``);
    lines.push(`- **Provider:** ${mission.provider.name} (${mission.provider.type})`);
    lines.push(`- **Model:** \`${mission.model}\``);
    lines.push(`- **Integrity Seal Status:** **${sealBadge}**`);
    lines.push(`- **Head Event Hash (SHA-256):** \`${mission.integrity.head_hash}\``);
    lines.push(`- **Total Audit Events:** ${mission.integrity.event_count}`);
    lines.push(`- **Created At:** ${mission.created_at}`);
    lines.push(`- **Updated At:** ${mission.updated_at}`);
    lines.push('');

    // Plain-English summary
    lines.push('## What Happened and Why');
    const humanDecisions = mission.events.filter(
      (e) => e.event_type === 'approved' || e.event_type === 'rejected' || e.event_type === 'redirected'
    );
    const diffsCreated = mission.events.filter((e) => e.event_type === 'diff_created');
    const testsRun = mission.events.filter((e) => e.event_type === 'test_passed' || e.event_type === 'test_failed');

    lines.push(
      `The human operator initiated this mission with the goal: "${mission.goal}". ` +
      `The specialist agents collaborated across planning, implementation, and testing phases. ` +
      `A total of ${diffsCreated.length} code diffs were proposed and reviewed. ` +
      `${humanDecisions.length} human-in-the-loop decisions were recorded. ` +
      `${testsRun.length} test executions were verified in the sandbox. ` +
      `The mission concluded with final status: **${mission.status}**.`
    );
    lines.push('');

    // Agent team
    lines.push('## Agent Team & Roles');
    lines.push('| Agent ID | Role |');
    lines.push('| :--- | :--- |');
    for (const a of mission.agents) {
      lines.push(`| \`${a.id}\` | ${a.role} |`);
    }
    lines.push('');

    // Human Decisions
    lines.push('## Human Decisions & Oversight');
    if (humanDecisions.length === 0) {
      lines.push('*No explicit approval decisions recorded (unsupervised mode or low-risk auto-allow).*');
    } else {
      lines.push('| Time (UTC) | Decision | Actor | Summary |');
      lines.push('| :--- | :--- | :--- | :--- |');
      for (const d of humanDecisions) {
        lines.push(`| ${d.timestamp} | **${d.event_type.toUpperCase()}** | ${d.actor} | ${d.summary} |`);
      }
    }
    lines.push('');

    // Chronological Timeline
    lines.push('## Chronological Event Timeline');
    lines.push('| # | Time (UTC) | Actor | Event Type | Summary | Event Hash |');
    lines.push('| :--- | :--- | :--- | :--- | :--- | :--- |');
    mission.events.forEach((evt, idx) => {
      const shortHash = evt.event_hash.slice(0, 12) + '...';
      lines.push(
        `| ${idx + 1} | ${evt.timestamp.slice(11, 19)} | ${evt.actor} (${evt.actor_type}) | \`${evt.event_type}\` | ${evt.summary} | \`${shortHash}\` |`
      );
    });
    lines.push('');

    // Result & Artifacts
    if (mission.result) {
      lines.push('## Outcome & Artifacts');
      if (mission.result.summary) lines.push(`- **Summary:** ${mission.result.summary}`);
      if (mission.result.files_changed && mission.result.files_changed.length > 0) {
        lines.push(`- **Files Changed:** ${mission.result.files_changed.map((f) => `\`${f}\``).join(', ')}`);
      }
      if (mission.result.tests_run !== undefined) {
        lines.push(`- **Tests Run:** ${mission.result.tests_run} (${mission.result.tests_passed ?? 0} passed)`);
      }
      lines.push('');
    }

    // Tamper audit details if any
    if (verification.tamperDetails && verification.tamperDetails.length > 0) {
      lines.push('## ⚠️ Tamper Audit Warnings');
      for (const warn of verification.tamperDetails) {
        lines.push(`- ${warn}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
