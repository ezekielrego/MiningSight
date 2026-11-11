export type ProjectAssetKind = 'model' | 'world' | 'video' | 'image' | 'document' | 'other';
export type ProjectProvider = 'worldlabs' | 'gemini' | 'gomera';

export interface ProjectAsset {
  id: string;
  name: string;
  storedName?: string;
  type: string;
  kind: ProjectAssetKind;
  size: number;
  uploadedAt: string;
  url: string;
  provider?: ProjectProvider;
  remoteUrl?: string;
  thumbnailUrl?: string;
  description?: string;
}

export interface ProjectSummary {
  id: string;
  projectName: string;
  updatedAt: string | null;
  assetCount: number;
  assets: ProjectAsset[];
  provider?: ProjectProvider;
  readOnly?: boolean;
  status?: 'ready' | 'needs-key' | 'empty' | 'offline';
}

export interface StorageQuota {
  usedBytes: number;
  quotaBytes: number;
  remainingBytes: number;
  usedPercent: number;
}

export interface MediaMarker {
  id: string;
  assetId: string;
  timeSeconds: number;
  frame?: number;
  note: string;
  createdAt: string;
}

export type GasMarkSpace = 'world' | 'media';

export interface GasMark {
  id: string;
  assetId: string | null;
  frame: number;
  timeSeconds?: number;
  space: GasMarkSpace;
  position?: { x: number; y: number; z: number };
  screen?: { x: number; y: number };
  radius: number;
  concentration: number;
  color: string;
  strokeId: string;
  createdAt: string;
}

export interface AuthUser {
  id: string;
  username: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
}
