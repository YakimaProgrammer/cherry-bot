import type { Prisma } from "../generated/prisma/client";

const EMOJI_PER_USER_LIMIT = 3;
const ONE_MONTH_IN_SECONDS = 60 * 60 * 24 * 31;

export async function upsertEmojiLimit(
  tx: Prisma.TransactionClient,
  guildId: string,
): Promise<number> {
  const guild = await tx.guild.upsert({
    where: { guildId },
    update: {},
    create: {
      guildId,
      emojiExpireTime: ONE_MONTH_IN_SECONDS,
      emojiPerUserLimit: EMOJI_PER_USER_LIMIT,
    },
    select: {
      emojiPerUserLimit: true,
    },
  });

  return guild.emojiPerUserLimit;
}
