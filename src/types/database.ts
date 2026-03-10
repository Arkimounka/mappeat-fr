
import { Timestamp } from "firebase/firestore";

// Supported languages based on ISO 639-1 codes from PRD
export type LanguageCode = 'en' | 'ko' | 'fr' | 'de' | 'es' | 'zh' | 'jp';

// Input type for sentences, defaults to 'keyboard'
export type InputType = 'keyboard' | 'voice';

/**
 * Represents the structure of a document in the 'Users' collection.
 * This includes user profile information and their cumulative statistics.
 */
export interface UserDocument {
  // User profile data, can be expanded as needed.
  uid: string;
  email?: string | null;
  displayName?: string | null;

  // Cumulative statistics for user's learning progress.
  totalRecallCount: number;      // Cumulative recall attempts.
  totalLearningTime: number;     // Cumulative study time in minutes.
  totalSentenceCount: number;    // Total number of sentences stored by the user.
}

/**
 * Represents the structure of a document in the 'Sentences' collection.
 * Each document is a sentence the user is learning.
 */
export interface Sentence {
  id?: string;                   // Firestore document ID.

  originalText: string;          // The sentence in the target language.
  languageCode: LanguageCode;    // ISO 639-1 code for the target language.
  userContext?: string | null;   // Optional context or meaning provided by the user.

  createdAt: Timestamp;          // Timestamp when the sentence was first created.
  lastLearnedAt: Timestamp;      // Timestamp of the last review session.
  cooldownUntil: Timestamp;      // Timestamp until which this sentence is excluded from review.

  recallCount: number;           // Cumulative recall count for this specific sentence.
  inputType: InputType;          // How the sentence was input (e.g., 'keyboard', 'voice'). Defaults to 'keyboard'.
}

