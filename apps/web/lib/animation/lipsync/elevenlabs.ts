// ElevenLabs Omnihuman LipSync provider — scaffold.
//
// At time of writing (April 2026) ElevenLabs's Omnihuman model is in
// limited preview. The exact API surface is fluid — keeping this as a
// scaffold so we can swap a real implementation in once endpoints
// stabilize. ELEVENLABS_LIPSYNC_MODEL env var lets you point at
// "omnihuman-1.5" / "omnihuman-2" / etc. without code changes.
//
// Until preview access lands the provider throws a clear config error,
// so accidental selection via LIPSYNC_PROVIDER=elevenlabs surfaces fast.

import {
  LipSyncProvider,
  LipSyncInput,
  LipSyncSubmitResult,
  LipSyncStatusResult,
  LipSyncFinalResult,
  LipSyncConfigError,
} from './types';

const DEFAULT_MODEL = 'omnihuman-1.5';

class ElevenLabsLipSync implements LipSyncProvider {
  readonly name = 'elevenlabs';

  private requireEnabled(): never {
    throw new LipSyncConfigError(
      'ElevenLabs Omnihuman lipsync provider not yet wired (preview only). ' +
        'Set LIPSYNC_PROVIDER=kling or sync until ElevenLabs publishes the public API ' +
        '— ELEVENLABS_LIPSYNC_MODEL is reserved for the future endpoint.',
      'elevenlabs',
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async submit(_input: LipSyncInput): Promise<LipSyncSubmitResult> {
    this.requireEnabled();
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getStatus(_providerJobId: string): Promise<LipSyncStatusResult> {
    this.requireEnabled();
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async generate(_input: LipSyncInput): Promise<LipSyncFinalResult> {
    this.requireEnabled();
  }
}

export const elevenLabsLipSyncProvider: LipSyncProvider = new ElevenLabsLipSync();
export const ELEVENLABS_LIPSYNC_DEFAULT_MODEL = DEFAULT_MODEL;
