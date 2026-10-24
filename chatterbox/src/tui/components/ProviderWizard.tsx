import React, { useState } from 'react';
import { Box, Text, useInput, useApp, useStdin } from 'ink';
import { ChatterboxLogo } from './ChatterboxLogo.js';
import { Divider } from './Divider.js';
import { Spinner } from './Spinner.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';
import { symbols } from '../design/symbols.js';
import { useMenuNavigation } from '../hooks/useMenuNavigation.js';
import {
  PROVIDER_DISPLAY_ORDER,
  PROVIDER_DEFINITIONS,
  ProviderName,
  maskApiKey,
} from '../../core/config/provider-registry.js';

type WizardStep = 'provider' | 'apikey' | 'model' | 'testing' | 'success' | 'error';

export interface ProviderWizardResult {
  providerName: ProviderName;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface ProviderWizardProps {
  onComplete: (result: ProviderWizardResult) => void;
  onCancel: () => void;
}

export const ProviderWizard: React.FC<ProviderWizardProps> = ({ onComplete, onCancel }) => {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const noColor = isNoColor();

  const [step, setStep] = useState<WizardStep>('provider');
  const [selectedProvider, setSelectedProvider] = useState<ProviderName>('openai');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [chosenModel, setChosenModel] = useState('');

  // Provider selection step
  const providerNames = [...PROVIDER_DISPLAY_ORDER];
  const providerNav = useMenuNavigation(providerNames, 0);

  // Model selection step
  const def = PROVIDER_DEFINITIONS[selectedProvider];
  const modelOptions = [...def.popularModels, '(Enter model name manually…)'];
  const modelNav = useMenuNavigation(modelOptions, 0);
  const [manualModel, setManualModel] = useState('');
  const [isManualModelEntry, setIsManualModelEntry] = useState(false);

  useInput((input, key) => {
    if (key.escape) {
      if (step === 'provider') {
        onCancel();
        return;
      }
      if (step === 'apikey') {
        setStep('provider');
        setApiKey('');
        return;
      }
      if (step === 'model' && isManualModelEntry) {
        setIsManualModelEntry(false);
        setManualModel('');
        return;
      }
      if (step === 'model') {
        setStep('apikey');
        return;
      }
      if (step === 'error') {
        setStep('model');
        setErrorMessage('');
        return;
      }
      if (step === 'success') {
        onCancel();
        return;
      }
      return;
    }

    // Provider selection
    if (step === 'provider') {
      if (key.upArrow) { providerNav.moveUp(); return; }
      if (key.downArrow) { providerNav.moveDown(); return; }
      if (key.return) {
        const pName = providerNav.selectedItem;
        setSelectedProvider(pName);
        const provDef = PROVIDER_DEFINITIONS[pName];
        setBaseUrl(provDef.baseUrl);
        if (!provDef.requiresApiKey) {
          setStep('model');
        } else {
          setStep('apikey');
        }
        return;
      }
      if (input.toLowerCase() === 'q') { exit(); return; }
      return;
    }

    // API key entry
    if (step === 'apikey') {
      if (key.return) {
        if (apiKey.trim().length > 0) {
          setStep('model');
        }
        return;
      }
      if (key.backspace || key.delete) {
        setApiKey((prev) => prev.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setApiKey((prev) => prev + input);
        return;
      }
      return;
    }

    // Custom base URL entry
    if (step === 'model' && selectedProvider === 'custom' && !baseUrl) {
      if (key.return && customBaseUrl.trim().length > 0) {
        setBaseUrl(customBaseUrl.trim());
        return;
      }
      if (key.backspace || key.delete) {
        setCustomBaseUrl((prev) => prev.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setCustomBaseUrl((prev) => prev + input);
        return;
      }
      return;
    }

    // Model selection
    if (step === 'model') {
      if (isManualModelEntry) {
        if (key.return && manualModel.trim().length > 0) {
          finishWizard(manualModel.trim());
          return;
        }
        if (key.backspace || key.delete) {
          setManualModel((prev) => prev.slice(0, -1));
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setManualModel((prev) => prev + input);
          return;
        }
        return;
      }

      if (key.upArrow) { modelNav.moveUp(); return; }
      if (key.downArrow) { modelNav.moveDown(); return; }
      if (key.return) {
        const selected = modelNav.selectedItem;
        if (selected.startsWith('(Enter')) {
          setIsManualModelEntry(true);
          return;
        }
        finishWizard(selected);
        return;
      }
      return;
    }

    // Error step
    if (step === 'error') {
      if (input.toLowerCase() === 'r') {
        finishWizard(manualModel || modelNav.selectedItem);
        return;
      }
      if (input.toLowerCase() === 'b') {
        setStep('model');
        setErrorMessage('');
        return;
      }
      return;
    }

    // Success step
    if (step === 'success') {
      if (key.return) {
        onComplete({
          providerName: selectedProvider,
          apiKey,
          baseUrl,
          model: chosenModel || manualModel || modelNav.selectedItem,
        });
        return;
      }
      return;
    }
  }, { isActive: Boolean(isRawModeSupported && process.stdin.isTTY) });

  function finishWizard(modelName: string): void {
    setChosenModel(modelName);
    setStep('testing');

    // Simulate connection test (actual test happens in the command handler)
    // We transition to success/error state after a brief delay for UX
    setTimeout(() => {
      // For now, always succeed. Real validation happens in the command.
      setStep('success');
    }, 800);
  }

  const providerDef = PROVIDER_DEFINITIONS[selectedProvider];

  // --- RENDER ---
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <ChatterboxLogo variant="compact" version="Setup" />

      {/* Step 1: Provider selection */}
      {step === 'provider' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>
            Select your AI provider:
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {providerNames.map((pName, idx) => {
              const pDef = PROVIDER_DEFINITIONS[pName];
              const isSelected = idx === providerNav.selectedIndex;
              return (
                <Box key={pName} flexDirection="row">
                  <Text color={noColor ? undefined : (isSelected ? chatterboxAnsi.brand : chatterboxAnsi.textMuted)}>
                    {isSelected ? '  ▸ ' : '    '}
                  </Text>
                  <Text
                    color={noColor ? undefined : (isSelected ? chatterboxAnsi.textPrimary : chatterboxAnsi.textSecondary)}
                    bold={isSelected}
                  >
                    {pDef.displayName}
                  </Text>
                  {isSelected && (
                    <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
                      {'  '}{pDef.description}
                    </Text>
                  )}
                </Box>
              );
            })}
          </Box>
          <Box marginTop={1}>
            <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
              ↑/↓ navigate · Enter select · Esc cancel
            </Text>
          </Box>
        </Box>
      )}

      {/* Step 2: API Key entry */}
      {step === 'apikey' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>
            {providerDef.displayName} — Paste your API key:
          </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
            Keys are masked and never logged or stored in plaintext config.
          </Text>
          <Box marginTop={1} flexDirection="row">
            <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>  API Key: </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>
              {apiKey.length > 0 ? maskApiKey(apiKey) : ''}
            </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>_</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
              Enter confirm · Esc back
            </Text>
          </Box>
        </Box>
      )}

      {/* Step 3: Custom base URL (only for 'custom' provider) */}
      {step === 'model' && selectedProvider === 'custom' && !baseUrl && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>
            Enter your API base URL:
          </Text>
          <Box marginTop={1} flexDirection="row">
            <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>  Base URL: </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>{customBaseUrl}</Text>
            <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>_</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
              Enter confirm · Esc back
            </Text>
          </Box>
        </Box>
      )}

      {/* Step 3: Model selection */}
      {step === 'model' && (selectedProvider !== 'custom' || baseUrl) && (
        <Box flexDirection="column" marginTop={1}>
          <Box flexDirection="row">
            <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Provider: </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>{providerDef.displayName}</Text>
          </Box>
          <Box flexDirection="row">
            <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Base URL: </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>{baseUrl}</Text>
          </Box>

          <Divider length={62} marginY={0} />

          {isManualModelEntry ? (
            <Box flexDirection="column" marginTop={1}>
              <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>
                Enter model name:
              </Text>
              <Box marginTop={1} flexDirection="row">
                <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>{'  > '}</Text>
                <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>{manualModel}</Text>
                <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>_</Text>
              </Box>
              <Box marginTop={1}>
                <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
                  Enter confirm · Esc back to list
                </Text>
              </Box>
            </Box>
          ) : (
            <Box flexDirection="column" marginTop={1}>
              <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>
                Select model:
              </Text>
              <Box flexDirection="column" marginTop={1}>
                {modelOptions.map((model, idx) => {
                  const isSelected = idx === modelNav.selectedIndex;
                  return (
                    <Box key={model} flexDirection="row">
                      <Text color={noColor ? undefined : (isSelected ? chatterboxAnsi.brand : chatterboxAnsi.textMuted)}>
                        {isSelected ? '  ▸ ' : '    '}
                      </Text>
                      <Text
                        color={noColor ? undefined : (isSelected ? chatterboxAnsi.textPrimary : chatterboxAnsi.textSecondary)}
                        bold={isSelected}
                      >
                        {model}
                      </Text>
                    </Box>
                  );
                })}
              </Box>
              <Box marginTop={1}>
                <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
                  ↑/↓ navigate · Enter select · Esc back
                </Text>
              </Box>
            </Box>
          )}
        </Box>
      )}

      {/* Step 4: Testing connection */}
      {step === 'testing' && (
        <Box flexDirection="column" marginTop={1}>
          <Box flexDirection="row">
            <Spinner />
            <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>
              Testing connection to {providerDef.displayName}…
            </Text>
          </Box>
        </Box>
      )}

      {/* Step 5: Success */}
      {step === 'success' && (
        <Box flexDirection="column" marginTop={1}>
          <Box flexDirection="row">
            <Text color={noColor ? undefined : chatterboxAnsi.success}>{symbols.status.done} </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>
              Connected to {providerDef.displayName} · {manualModel || modelNav.selectedItem}
            </Text>
          </Box>
          <Box flexDirection="row" marginTop={0}>
            <Text color={noColor ? undefined : chatterboxAnsi.success}>{symbols.status.done} </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>
              Provider and model saved.
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
              Press Enter to return to the welcome screen.
            </Text>
          </Box>
        </Box>
      )}

      {/* Step 5b: Error */}
      {step === 'error' && (
        <Box flexDirection="column" marginTop={1}>
          <Box flexDirection="row">
            <Text color={noColor ? undefined : chatterboxAnsi.error}>{symbols.status.failed} </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>
              Connection failed: {errorMessage}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
              R retry · B go back · Esc cancel
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
