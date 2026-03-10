# [cite_start][PRD] Repeat Baby Repeat (Foreign Language Learning App) - Phase I (MVP) Focus [cite: 116]

## 1. Product Vision and Purpose
* **Vision**: Let's repeat. [cite_start]Let's feel confidence and achievement in foreign languages through repetition. [cite: 118]
* [cite_start]**Purpose**: [cite: 119]
    * [cite_start]Provide an experience where users can review and apply learned sentences at regular intervals. [cite: 120]
    * [cite_start]**Recall-oriented learning**: Provide training to immediately recall the target language when a specific meaning or situation is given. [cite: 121]
    * [cite_start]Provide an advantageous experience for multi-language learning by presenting specific meanings/situations in multiple languages. [cite: 122]

## 2. Core Features (Phase I MVP)

### 2.1. Language Settings and Management
* [cite_start]**Target Language**: The language the user actually intends to acquire. [cite: 125]
* [cite_start]**Cross Language**: Acts as a 'Recall Cue' (meaning trigger) to assist learning. [cite: 126]
* [cite_start]**Supported Languages (Phase I)**: English (en), Korean (ko). [cite: 127]
* [cite_start]**Expansion Plan (Phase II)**: French (fr), German (de), Spanish (es), Chinese (zh), Japanese (jp). [cite: 128]

### 2.2. Sentence Input and Storage (Initial Learning)
* [cite_start]Users input sentences in the 'Target Language'. [cite: 130]
* [cite_start]Users can record the meaning and situation of the input sentence in the **context/meaning field**. [cite: 131]
* [cite_start]**UI Implementation**: To reduce input burden, a **Collapsible UI** is applied, which is folded by default and can be expanded by clicking the 'Add Context' button when needed. [cite: 132]
* [cite_start]The entered context is used as the highest priority reference material when the AI performs 'Cross Language' translation during retraining. [cite: 133]
* [cite_start]**Storage Flow**: When the user clicks the final 'Save' button, the input sentence, target language, and context information are recorded together in the **[Sentences Collection]**. [cite: 134]

### 2.3. AI-based Retraining (Recall & Response)
* [cite_start]**Language Selection**: Users first select the language they want to retrain. [cite: 136]
* [cite_start]**Random Extraction**: Only sentences corresponding to the selected language that are not in a cooldown state are randomly extracted from the **[Sentences Collection]**. [cite: 137]
* [cite_start]**Meaning Presentation**: If there is a 'userContext' stored in the **[Sentences Collection]**, the AI refers to it to translate it into the 'Cross Language' and shows it to the user. [cite: 138]
* [cite_start]If there is no context, the AI will automatically determine and perform the translation. [cite: 139]
* [cite_start]**User Input and Evaluation**: When the user inputs a sentence, the AI evaluates accuracy and naturalness by comparing it with the original sentence. [cite: 140]

### 2.4. Intelligent Expansion Learning (Read-only)
* [cite_start]**Applied Sentence Recommendation**: AI generates and shows two similar sentences utilizing patterns from the original text. [cite: 142]
* [cite_start]**Dialogue Generation**: Generates a short dialogue of about 3 sentences showing how the original sentence is used in real situations. [cite: 143]
* [cite_start]**Note**: Each generated sentence is arranged as an individual **Clickable Component**. [cite: 144]
* [cite_start]In Phase I, 'selectability' is visually implied, while the actual registration popup logic is activated in Phase II. [cite: 145]

## 3. Core Logic and Data Flow (Reflecting Phase II Scalability)

### 3.1. Retraining and Cooldown Control
* [cite_start]**Entry Condition**: Cooldown is applied when the user clicks the 'Done' button after AI evaluation. [cite: 148]
* [cite_start]**Retention Period**: Excluded from retraining extraction targets based on user selection (1/2/3/4 weeks). [cite: 149]
* [cite_start]**Scalability Consideration**: A timestamp processing framework is pre-configured for entry/exit during retraining for Phase II's 'time measurement' feature. [cite: 150]

### 3.2. Database Structure (Firebase Firestore - Phase II Fields Pre-reflected)
* [cite_start]**Sentences Collection**: [cite: 152]
    * [cite_start]`originalText`: Original sentence [cite: 153]
    * [cite_start]`languageCode`: Target language information (Stores ISO 639-1 standard codes: 'en', 'fr', 'es') [cite: 154]
    * [cite_start]`userContext`: Meaning/context of the sentence entered by the user (Optional) [cite: 155]
    * [cite_start]`createdAt`: Registration date [cite: 156]
    * [cite_start]`lastLearnedAt`: Last learned date [cite: 157]
    * [cite_start]`cooldownUntil`: Timestamp for retraining exclusion expiration [cite: 158]
    * [cite_start]`recallCount`: Cumulative retraining count per sentence (Defaulted to 0 for Phase II) [cite: 159]
    * [cite_start]`inputType`: 'keyboard' or 'voice' (Default 'keyboard') [cite: 160]
* [cite_start]**Users Collection**: [cite: 161]
    * [cite_start]User profile and language settings [cite: 162]
    * [cite_start]Cumulative statistics fields: `totalRecallCount`, `totalLearningTime`, `totalSentenceCount` (Pre-created for Phase II statistics) [cite: 163]

### 3.3. Input Logic Design (Input Abstraction)
* [cite_start]**Unified Input Handler**: Designed so that both text typed via keyboard and text converted via STT are first contained in the **same input window (Editable Text Field)**. [cite: 165]
* [cite_start]**User Correction Flow**: If the STT-converted text is incorrect, the user can manually correct it in the input window before clicking 'Done' to ensure data accuracy in the **[Sentences Collection]**. [cite: 166]

## 4. Tech Stack (Reflecting Phase II Scalability)
* [cite_start]**Frontend**: Next.js (React) [cite: 168]
    * [cite_start]Structure facilitating easy session time measurement and state management. [cite: 169]
    * [cite_start]UI component structure design capable of popping up Modals or popups when text is clicked. [cite: 170]
    * [cite_start]Implementation of language selection modals and collapsible components for context input. [cite: 171]
    * [cite_start]**Multi-language Layout**: Responsive text container design considering Phase II's special character systems (Chinese, Japanese, etc.) and long sentence structures (German, etc.). [cite: 172]
    * [cite_start]**Extensible Language Selection UI**: Phase I displays only 2 languages, but adopts a list-based modal structure to minimize code modification when adding languages in the future. [cite: 173]
* [cite_start]**Backend**: Firebase Functions - Atomic operations via `increment()` function when updating cumulative data. [cite: 174]
* [cite_start]**Database**: Firebase Firestore. [cite: 175]
* [cite_start]**AI Model**: Gemini 1.5 Pro/2.0 [cite: 176]
    * [cite_start]Design prompts to respond in JSON array format with IDs for each sentence when generating expansion sentences, allowing immediate mapping of selected sentence data to the DB in the future. [cite: 177]
    * [cite_start]Design to pass 'userContext' data as 'System Instruction' or 'Few-shot' during retraining to generate Cross Language triggers (translations) that perfectly match the user's intent. [cite: 178]
    * [cite_start]**Prompt Engineering**: Designed so that the AI applies cultural context and grammatical rules of the corresponding language according to the `languageCode` passed during retraining. [cite: 179]

## 5. Step-by-step Development Roadmap
* [cite_start]**Phase I (MVP)**: Completion of the basic learning loop based on features in sections 2, 3, and 4 above. [cite: 181]
* [cite_start]**Phase II (Feature Additions)**: Implementation of additional languages, STT, expansion sentence selection, cumulative statistics recording and visualization, and learning time measurement. [cite: 182]
