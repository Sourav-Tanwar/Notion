import { HttpError } from '../../utils/HttpError';
import { UserModel, type UserDoc } from '../auth/auth.model';
import { toPublicUser } from '../auth/auth.service';
import { getStorage } from '../../services/storage.service';
import { processAvatar } from '../../services/image.pipeline';
import { audit } from '../../services/audit.service';

export interface ProfileUpdate {
  name?: string;
  username?: string | null;
  bio?: string;
  themePref?: 'system' | 'light' | 'dark';
}

export const profileService = {
  async update(userId: string, patch: ProfileUpdate) {
    if (patch.username) {
      const taken = await UserModel.findOne({
        username: patch.username.toLowerCase(),
        _id: { $ne: userId },
      }).lean();
      if (taken) throw new HttpError(409, 'UsernameTaken');
    }
    const user = await UserModel.findByIdAndUpdate(userId, patch, { new: true });
    if (!user) throw new HttpError(404, 'NotFound');
    return toPublicUser(user as unknown as UserDoc);
  },

  /**
   * Replace the user's avatar.
   *
   * We do NOT trust the client-supplied MIME or the raw bytes. The image is
   * re-encoded through `processAvatar` which:
   *   - rejects polyglot / malformed inputs via magic-byte sniffing + sharp,
   *   - resizes to a fixed square,
   *   - strips ALL metadata (EXIF GPS especially), and
   *   - re-encodes to WebP.
   *
   * The previous avatar object is best-effort deleted to avoid orphan blobs.
   */
  async setAvatar(userId: string, fileBuf: Buffer, _claimedMime: string) {
    let processed;
    try {
      processed = await processAvatar(fileBuf);
    } catch (e) {
      audit.log('avatar.upload_rejected', {
        userId,
        meta: { reason: (e as Error).message },
      });
      throw e;
    }

    const key = `avatars/${userId}-${Date.now()}.${processed.ext}`;
    const url = await getStorage().save(key, processed.buffer, processed.mime);

    const user = await UserModel.findById(userId);
    if (!user) throw new HttpError(404, 'NotFound');

    const previous = user.avatarUrl;
    user.avatarUrl = url;
    await user.save();

    if (previous) {
      try {
        const idx = previous.indexOf('/avatars/');
        if (idx >= 0) await getStorage().remove(previous.slice(idx + 1));
      } catch {
        /* orphan file is harmless */
      }
    }
    return toPublicUser(user as unknown as UserDoc);
  },

  async clearAvatar(userId: string) {
    const user = await UserModel.findById(userId);
    if (!user) throw new HttpError(404, 'NotFound');
    const previous = user.avatarUrl;
    user.avatarUrl = null;
    await user.save();
    if (previous) {
      try {
        const idx = previous.indexOf('/avatars/');
        if (idx >= 0) await getStorage().remove(previous.slice(idx + 1));
      } catch {
        /* ignore */
      }
    }
    return toPublicUser(user as unknown as UserDoc);
  },
};
