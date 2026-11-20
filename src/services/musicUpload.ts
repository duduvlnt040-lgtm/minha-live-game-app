import { inferTrackMetadataFromFilename } from '../lib/smartMusicAi';
import { apiRequest } from './api';
import type { MusicScope, MusicTrack } from '../types/platform';

export interface SignedUploadResponse {
  signedUrl: string;
  token: string;
  storagePath: string;
  audioUrl: string;
  mimeType: string;
}

export async function uploadAudioTrackFile(params: {
  file: File;
  scope: MusicScope;
  gameId: string;
  title?: string;
  artist?: string;
  genre?: string;
  mood?: string;
  replaceTrackId?: string;
}): Promise<MusicTrack> {
  const { file, scope, gameId } = params;
  const inferred = inferTrackMetadataFromFilename(file.name);

  // 1. Request signed Supabase Storage upload URL from server (respects RBAC + bypasses Vercel 4.5MB limit)
  const signed = await apiRequest<SignedUploadResponse>('/api/music/upload-url', {
    method: 'POST',
    body: JSON.stringify({
      scope,
      fileName: file.name,
      mimeType: file.type || 'audio/mpeg',
      fileSizeBytes: file.size,
    }),
  });

  // 2. Upload binary audio directly to Supabase Storage signed URL
  const uploadRes = await fetch(signed.signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': signed.mimeType || file.type || 'audio/mpeg',
    },
    body: file,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => '');
    throw new Error(
      `Falha ao enviar áudio para o Supabase Storage (${uploadRes.status}): ${errText || 'verifique o bucket mlg-music'}`,
    );
  }

  // 3. Register or replace track metadata in PostgreSQL
  if (params.replaceTrackId) {
    const patched = await apiRequest<{ track: MusicTrack }>(
      `/api/music/tracks/${encodeURIComponent(params.replaceTrackId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          storagePath: signed.storagePath,
          audioUrl: signed.audioUrl,
          mimeType: signed.mimeType,
          fileSizeBytes: file.size,
          ...(params.title ? { title: params.title } : {}),
        }),
      },
    );
    return patched.track;
  }

  const created = await apiRequest<{ track: MusicTrack }>('/api/music/tracks', {
    method: 'POST',
    body: JSON.stringify({
      scope,
      gameId: gameId || 'all',
      title: params.title?.trim() || inferred.title,
      artist: params.artist?.trim() ?? inferred.artist,
      genre: params.genre?.trim() || inferred.genre,
      mood: params.mood?.trim() || inferred.mood,
      storagePath: signed.storagePath,
      audioUrl: signed.audioUrl,
      mimeType: signed.mimeType,
      fileSizeBytes: file.size,
      aiTags: inferred.aiTags,
      originalFileName: file.name,
    }),
  });

  return created.track;
}
