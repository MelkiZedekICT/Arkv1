import { Command } from 'commander';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MissionLedger } from '../../core/ledger/mission-ledger.js';
import { LedgerExporter } from '../../core/ledger/ledger-exporter.js';
import { symbols } from '../../tui/design/symbols.js';
import { isNoColor } from '../../tui/design/tokens.js';

const bold = (s: string) => (isNoColor() ? s : `\x1b[1m${s}\x1b[0m`);
const dim = (s: string) => (isNoColor() ? s : `\x1b[2m${s}\x1b[0m`);
const green = (s: string) => (isNoColor() ? s : `\x1b[32m${s}\x1b[0m`);
const yellow = (s: string) => (isNoColor() ? s : `\x1b[33m${s}\x1b[0m`);
const red = (s: string) => (isNoColor() ? s : `\x1b[31m${s}\x1b[0m`);
const cyan = (s: string) => (isNoColor() ? s : `\x1b[36m${s}\x1b[0m`);

export const missionCommand = new Command('mission').description(
  'Inspect, verify, and export tamper-evident Mission Ledgers'
);

missionCommand
  .command('list')
  .description('List all local missions and their integrity status')
  .action(() => {
    const ledger = new MissionLedger();
    const missions = ledger.listMissions();

    if (missions.length === 0) {
      console.log(dim('\nNo missions found in .chatterbox/missions/'));
      console.log(dim('Run a mission with: ') + cyan('agentfeed run "<goal>"') + '\n');
      return;
    }

    console.log(bold('\nChatterbox Mission Ledger (Local-first audit trail)'));
    console.log(dim('────────────────────────────────────────────────────────────────────────'));
    console.log(
      `${bold('ID')}`.padEnd(28) +
      `${bold('DISPLAY')}`.padEnd(10) +
      `${bold('STATUS')}`.padEnd(14) +
      `${bold('SEAL')}`.padEnd(16) +
      `${bold('PROVIDER')}`.padEnd(14) +
      `${bold('DATE')}`
    );
    console.log(dim('────────────────────────────────────────────────────────────────────────'));

    for (const m of missions) {
      const ver = MissionLedger.verifyMission(m);
      const sealStr =
        ver.status === 'VERIFIED'
          ? green('✓ VERIFIED')
          : ver.status === 'TAMPERED'
          ? red('✗ TAMPERED')
          : yellow('○ UNVERIFIED');

      const statusColor =
        m.status === 'completed' ? green : m.status === 'failed' ? red : yellow;

      const dateStr = m.created_at ? m.created_at.slice(0, 16).replace('T', ' ') : 'unknown';

      console.log(
        `${cyan(m.mission_id)}`.padEnd(isNoColor() ? 28 : 37) +
        `${m.display_id}`.padEnd(10) +
        `${statusColor(m.status)}`.padEnd(isNoColor() ? 14 : 23) +
        `${sealStr}`.padEnd(isNoColor() ? 16 : 25) +
        `${m.provider.type}`.padEnd(14) +
        `${dateStr}`
      );
    }
    console.log(dim('────────────────────────────────────────────────────────────────────────\n'));
  });

missionCommand
  .command('show <missionId>')
  .description('Display detailed mission record and verify cryptographic chain')
  .action((missionId: string) => {
    const ledger = new MissionLedger();
    const mission = ledger.loadMission(missionId);

    if (!mission) {
      console.error(red(`\nError: Mission "${missionId}" not found in .chatterbox/missions/\n`));
      process.exit(1);
    }

    const ver = MissionLedger.verifyMission(mission);
    const sealBadge =
      ver.status === 'VERIFIED'
        ? green('✓ VERIFIED (Cryptographically Sealed with Ed25519)')
        : ver.status === 'TAMPERED'
        ? red('✗ TAMPERED (Hash Chain Discrepancy Detected!)')
        : yellow('○ UNVERIFIED (Valid Hash Chain, Unsigned)');

    console.log(bold(`\n${symbols.logo.compactMark} Chatterbox · Mission ${mission.display_id} · ${mission.status}`));
    console.log(dim('────────────────────────────────────────────────────────────────────────'));
    console.log(`${bold('Goal:')}      ${mission.goal}`);
    console.log(`${bold('Mission:')}   ${cyan(mission.mission_id)}`);
    console.log(`${bold('Provider:')}  ${mission.provider.name} (${mission.provider.type}) · ${cyan(mission.model)}`);
    console.log(`${bold('Workspace:')} ${mission.workspace_root}`);
    console.log(`${bold('Integrity:')} ${sealBadge}`);
    console.log(`${bold('Head Hash:')} ${dim(mission.integrity.head_hash)}`);
    console.log(`${bold('Events:')}    ${mission.integrity.event_count}`);
    console.log(dim('────────────────────────────────────────────────────────────────────────'));

    console.log(bold('\nTimeline:'));
    mission.events.forEach((evt, idx) => {
      const time = evt.timestamp.slice(11, 19);
      const shortHash = evt.event_hash.slice(0, 8);
      console.log(
        `  ${dim(`${idx + 1}.`)} ${dim(time)} ${cyan(evt.actor.padEnd(16))} ${bold(evt.event_type.padEnd(20))} ${evt.summary} ${dim(`[${shortHash}]`)}`
      );
    });

    if (ver.tamperDetails && ver.tamperDetails.length > 0) {
      console.log(red('\n⚠ Tamper Audit Warnings:'));
      ver.tamperDetails.forEach((w) => console.log(red(`  - ${w}`)));
    }

    console.log('');
  });

missionCommand
  .command('export <missionId>')
  .description('Export mission audit report to Markdown or JSON')
  .option('-f, --format <format>', 'Export format: md or json (default: md)', 'md')
  .option('-o, --out <path>', 'Output file path (default: stdout or standard artifacts directory)')
  .action((missionId: string, options: { format: string; out?: string }) => {
    const ledger = new MissionLedger();
    const mission = ledger.loadMission(missionId);

    if (!mission) {
      console.error(red(`\nError: Mission "${missionId}" not found in .chatterbox/missions/\n`));
      process.exit(1);
    }

    const fmt = options.format.toLowerCase();
    const content = fmt === 'json' ? LedgerExporter.exportJson(mission) : LedgerExporter.exportMarkdown(mission);

    if (options.out) {
      const outPath = resolve(options.out);
      writeFileSync(outPath, content, 'utf8');
      console.log(green(`\n✓ Exported mission ${mission.display_id} to ${outPath}\n`));
    } else {
      console.log(content);
    }
  });
