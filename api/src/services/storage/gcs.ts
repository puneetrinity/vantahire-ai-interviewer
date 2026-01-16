/**
 * Google Cloud Storage Service
 * Handles video recording uploads and signed URL generation
 */

import { Storage, GetSignedUrlConfig } from '@google-cloud/storage';
import { config } from '../../lib/config.js';
import { db } from '../../lib/db.js';

let storage: Storage | null = null;

function getStorage(): Storage {
  if (!storage) {
    if (!config.GCS_PROJECT_ID) {
      throw new Error('GCS_PROJECT_ID not configured');
    }

    storage = new Storage({
      projectId: config.GCS_PROJECT_ID,
      // Uses GOOGLE_APPLICATION_CREDENTIALS env var automatically
    });
  }
  return storage;
}

function getBucket() {
  if (!config.GCS_BUCKET) {
    throw new Error('GCS_BUCKET not configured');
  }
  return getStorage().bucket(config.GCS_BUCKET);
}

/**
 * Generate a signed URL for uploading a recording
 */
export async function generateUploadUrl(
  interviewId: string,
  contentType: string = 'video/webm'
): Promise<{ uploadUrl: string; gcsKey: string }> {
  const bucket = getBucket();

  // Generate unique key for the recording
  const timestamp = Date.now();
  const gcsKey = `recordings/${interviewId}/${timestamp}.webm`;

  const file = bucket.file(gcsKey);

  const options: GetSignedUrlConfig = {
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    contentType,
  };

  const [uploadUrl] = await file.getSignedUrl(options);

  return { uploadUrl, gcsKey };
}

/**
 * Generate a signed URL for downloading/viewing a recording
 */
export async function generateDownloadUrl(
  gcsKey: string,
  expiresInMinutes: number = 60
): Promise<string> {
  const bucket = getBucket();
  const file = bucket.file(gcsKey);

  const options: GetSignedUrlConfig = {
    version: 'v4',
    action: 'read',
    expires: Date.now() + expiresInMinutes * 60 * 1000,
  };

  const [downloadUrl] = await file.getSignedUrl(options);

  return downloadUrl;
}

/**
 * Save recording key to interview and generate download URL
 */
export async function saveRecordingKey(
  interviewId: string,
  gcsKey: string
): Promise<{ downloadUrl: string }> {
  await db.interview.update({
    where: { id: interviewId },
    data: { recordingGcsKey: gcsKey },
  });

  const downloadUrl = await generateDownloadUrl(gcsKey);
  return { downloadUrl };
}

/**
 * Get recording URL for an interview
 */
export async function getRecordingUrl(interviewId: string): Promise<string | null> {
  const interview = await db.interview.findUnique({
    where: { id: interviewId },
    select: { recordingGcsKey: true },
  });

  if (!interview?.recordingGcsKey) {
    return null;
  }

  return generateDownloadUrl(interview.recordingGcsKey);
}

/**
 * Delete a recording from GCS
 */
export async function deleteRecording(gcsKey: string): Promise<void> {
  const bucket = getBucket();
  const file = bucket.file(gcsKey);

  try {
    await file.delete();
  } catch (error) {
    // Ignore not found errors
    if ((error as { code?: number }).code !== 404) {
      throw error;
    }
  }
}

/**
 * Check if GCS is configured
 */
export function isGCSConfigured(): boolean {
  return !!(config.GCS_BUCKET && config.GCS_PROJECT_ID);
}

/**
 * Upload a buffer directly to GCS (for server-side uploads)
 */
export async function uploadBuffer(
  gcsKey: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  const bucket = getBucket();
  const file = bucket.file(gcsKey);

  await file.save(buffer, {
    contentType,
    metadata: {
      cacheControl: 'private, max-age=0',
    },
  });
}

/**
 * Stream upload to GCS
 */
export function createUploadStream(
  gcsKey: string,
  contentType: string
) {
  const bucket = getBucket();
  const file = bucket.file(gcsKey);

  return file.createWriteStream({
    contentType,
    resumable: false,
    metadata: {
      cacheControl: 'private, max-age=0',
    },
  });
}
