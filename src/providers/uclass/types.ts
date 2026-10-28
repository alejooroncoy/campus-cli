import type { Cookie } from '../blackboard/types.js';

export type UclassSession = {
  cookies: Cookie[];
  userUuid: string;
  expiresAt: number;
  capturedAt: number;
};

export type UclassRecording = {
  classId: string;
  recordingId: string;
  url: string;
  title: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
};

export type UclassTranscriptItem = {
  id: string;
  startSeconds: number | null;
  endSeconds: number | null;
  speaker: string | null;
  text: string;
};

export type UclassChatItem = {
  id: string;
  timestampSeconds: number | null;
  sender: string | null;
  text: string;
};

export type UclassTranscript = {
  recording: Pick<UclassRecording, 'classId' | 'recordingId' | 'url'>;
  title: string | null;
  durationSeconds: number | null;
  transcript: UclassTranscriptItem[];
  chat?: UclassChatItem[];
  /** An epoch chat without an epoch speech timestamp has its own timeline;
   * its zero must never be cited as the start of the recording. */
  chatTimeline?: 'recording' | 'first_chat_message';
};
