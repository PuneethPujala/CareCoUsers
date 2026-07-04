# 🔄 Offline Syncing & Cached Data Strategy

CareMyMed is designed to operate seamlessly in locations with unstable network coverage (e.g., hospitals, senior living facilities, transit). 

---

## Data Synchronization Flow

The mobile client leverages an optimistic UI pattern alongside a robust offline queuing mechanism to ensure zero clinical data loss:

```mermaid
flowchart TD
    %% User Action
    A[User Performs Action e.g., Log Vitals or Take Med] --> B[Zustand Store: Apply Optimistic Update to UI]
    B --> C{Is Client Online?}
    
    %% Online Branch
    C -- Yes --> D[Call API Gateway via Axios client]
    D --> E{Request Successful?}
    E -- Yes --> F[Confirm state & update Local Cache]
    E -- No --> G[Revert Optimistic UI & Display Error Alert]

    %% Offline Branch
    C -- No --> H[Set SyncState = 'offline_pending']
    H --> I[Serialize Request to AsyncStorage Mutation Queue]
    I --> J[Toast Alert: 'Vitals saved locally. Will sync when online.']

    %% Sync Trigger
    K[NetInfo Network Restore Event] --> L{Are mutations queued?}
    L -- Yes --> M[Set SyncState = 'syncing']
    M --> N[Process Queue Items sequentially FIFO]
    N --> O{API Request Succeeds?}
    O -- Yes --> P[Remove item from AsyncStorage Queue]
    O -- No --> Q[Keep item in Queue & Pause execution]
    P --> R{Queue Empty?}
    R -- Yes --> S[Set SyncState = 'synced' & Update dashboard]
    R -- No --> N
    L -- No --> T[Set SyncState = 'synced']
```

---

## Client Caching Strategy

The mobile application operates on a layered, secure caching system to manage performance and preserve patient privacy:

| Cache Key | Storage Mechanism | Security Level | Purpose |
|:---|:---|:---|:---|
| `medication_call_preferences` | `AsyncStorage` | Low | UI rendering & settings defaults |
| `health_profile` | `react-native-encrypted-storage` | High | Diagnostic history, clinical conditions |
| `medications_today` | `react-native-encrypted-storage` | High | Specific daily medication details |
| `patient_data` | `react-native-encrypted-storage` | High | Patient identity, address, phone number |
| `auth_session` | `expo-secure-store` | Maximum (OS Keychain) | JWT access keys, refresh tokens, user UIDs |

---

## Key Offline & Cache Implementations

1. **FIFO Mutation Queue**: Updates are logged sequentially. If one request fails due to a validation error, it is flagged, and the queue processing pauses to prevent out-of-order execution bugs.
2. **Encrypted Storage Isolation**: When sensitive health data is fetched, the keys are prefixed by the current user's UID. This prevents data leakage on shared/family tablets, as switching accounts immediately hides key records.
3. **Screen Capture Protections**: If the patient's profile has `allow_screenshots: false` enabled, the app utilizes native flag controllers (`FLAG_SECURE` on Android) to block screen captures and show a privacy overlay when the app transitions to the background.
