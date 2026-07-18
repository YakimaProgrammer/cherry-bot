import type { Prisma } from "../generated/prisma/client";

export async function recordAuditEvent(
  tx: Prisma.TransactionClient,
  userId: string,
  guildId: string,
  command: string,
  channelId: string,
) {
  await tx.auditEvent.create({
    data: {
      userId,
      guildId,
      command,
      channelId,
    },
  });
}
