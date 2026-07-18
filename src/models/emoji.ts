import type { EmojiStatus, Prisma } from "../generated/prisma/client";
import type { Emoji } from "../types";

async function getActiveEmoji(
  tx: Prisma.TransactionClient,
  guildId: string,
  userId?: string,
): Promise<Emoji[]> {
  const emoji = await tx.emoji.findMany({
    where: { guildId, userId },
    select: {
      emojiId: true,
      userId: true,
      statusEvents: {
        orderBy: { eventId: "desc" },
        take: 1,
        select: { status: true },
      },
      // @TODO: I currently store data for other servers where CherryBot might be used.
      // A cool statistic later on might be "foreign" uses of an emoji or something.
      // Anyway, that's why I filter to match the guildId like I do.
      usageEvents: {
        orderBy: { eventId: "desc" },
        take: 1,
        select: { timestamp: true },
        where: { guildId },
      },
      _count: {
        select: {
          usageEvents: {
            where: { guildId },
          },
        },
      },
    },
  });

  return (
    emoji
      .map((e) => ({
        userId: e.userId,
        emojiId: e.emojiId,
        status: e.statusEvents.at(0)?.status,
        usageCount: e._count.usageEvents,
        lastUsage: e.usageEvents.at(0)?.timestamp,
      }))
      .filter((e): e is Emoji => {
        return !(e.lastUsage === undefined || e.status === undefined);
      })
      // Yeah, this could be merged with the previous filter, but that blurs the line a bit for what
      .filter((e) => e.status === "Ok")
      // I'd do this with an `ORDER BY` but Prisma doesn't support `WHERE` + `ORDER BY`
      .sort((a, b) => b.usageCount - a.usageCount)
  );
}

export async function getUserActiveEmoji(
  tx: Prisma.TransactionClient,
  guildId: string,
  userId?: string,
) {
  return await getActiveEmoji(tx, guildId, userId);
}

export async function getServerActiveEmoji(
  tx: Prisma.TransactionClient,
  guildId: string,
) {
  return await getActiveEmoji(tx, guildId);
}

export async function getEmojiOwner(
  tx: Prisma.TransactionClient,
  emojiId: string,
): Promise<string | undefined> {
  return (
    await tx.emoji.findUnique({ where: { emojiId }, select: { userId: true } })
  )?.userId;
}

// This could also just call `getUserActiveEmoji` at the expense of trashing a some compute for calculating unused columns
export async function countUserActiveEmoji(
  tx: Prisma.TransactionClient,
  guildId: string,
  userId: string,
): Promise<number> {
  const emojis = await tx.emoji.findMany({
    where: { guildId, userId },
    select: {
      statusEvents: {
        orderBy: { eventId: "desc" },
        take: 1,
        select: { status: true },
      },
    },
  });

  return emojis.filter(({ statusEvents }) => statusEvents[0]?.status === "Ok")
    .length;
}

export async function pushEmojiStatus(
  tx: Prisma.TransactionClient,
  emojiId: string,
  userId: string,
  newStatus: EmojiStatus,
) {
  // You could also do this through the emoji model
  await tx.emojiStatusEvent.create({
    data: {
      emojiId,
      userId,
      status: newStatus,
    },
  });
}

export async function createEmoji(
  tx: Prisma.TransactionClient,
  guildId: string,
  userId: string,
  emojiId: string,
  cloudflareId: string,
  channelId: string,
) {
  await tx.emoji.create({
    data: {
      emojiId,
      cloudflareId,
      guildId,
      userId,
      statusEvents: {
        create: {
          userId,
          status: "Ok",
        },
      },
      usageEvents: {
        create: {
          userId,
          guildId,
          channelId,
        },
      },
    },
  });
}

export async function pushEmojiUsage(
  tx: Prisma.TransactionClient,
  emojiId: string,
  userId: string,
  guildId: string,
  channelId: string,
) {
  // You could also do this through the emoji model
  await tx.emojiUsageEvent.create({
    data: {
      emojiId,
      userId,
      guildId,
      channelId,
    },
  });
}
