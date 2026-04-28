/**
 * Budget-level operations: bank balance updates, member listing, invite flow.
 *
 * When `DATABASE_URL` is absent, mutating paths throw or no-op per function — the app
 * falls back to JSON `state.ts` persistence for demos. Production traffic should always
 * hit the Prisma branches.
 *
 * @module lib/persistence/budget
 */

import { randomUUID } from "node:crypto";

import { unstable_noStore as noStore } from "next/cache";

import { getPrismaClient } from "@/lib/prisma";
import { toIsoDate } from "@/lib/utils";

import { getAuthedUser, getBudgetContext } from "./auth";
import { hasConfiguredDatabase } from "./config";
import { readState, writeState } from "./state";

export async function updateBankBalance(amount: number) {
  if (hasConfiguredDatabase()) {
    const prisma = getPrismaClient();
    const { budget } = await getBudgetContext();

    await prisma.budget.update({
      where: { id: budget.id },
      data: { bankBalance: amount, balanceAsOf: new Date() },
    });
    return;
  }

  const state = await readState();
  state.user.bankBalance = amount;
  state.user.balanceAsOf = toIsoDate(new Date());
  await writeState(state);
}

export async function getBudgetMembers() {
  noStore();

  if (!hasConfiguredDatabase()) {
    const state = await readState();
    return [
      {
        userId: state.user.id,
        email: state.user.email,
        name: state.user.name,
        role: "owner",
        createdAt: new Date().toISOString(),
      },
    ];
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const members = await prisma.budgetMember.findMany({
    where: { budgetId: budget.id },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  return members.map((member) => ({
    userId: member.userId,
    email: member.user.email,
    name: member.user.name ?? "",
    role: member.role,
    createdAt: member.createdAt.toISOString(),
  }));
}

export async function createBudgetInvite(email: string) {
  if (!hasConfiguredDatabase()) {
    throw new Error("Invites require a database.");
  }

  const prisma = getPrismaClient();
  const { authedUser, budget } = await getBudgetContext();

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Email is required.");

  const token = randomUUID();

  const invite = await prisma.budgetInvite.create({
    data: {
      budgetId: budget.id,
      email: normalizedEmail,
      token,
      invitedByUserId: authedUser.id,
    },
  });

  return invite.token;
}

export async function acceptBudgetInvite(token: string) {
  if (!hasConfiguredDatabase()) {
    throw new Error("Invites require a database.");
  }

  const prisma = getPrismaClient();
  const authedUser = await getAuthedUser();

  const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const invite = await prisma.budgetInvite.findFirst({
    where: {
      token,
      acceptedAt: null,
      createdAt: { gte: new Date(Date.now() - INVITE_TTL_MS) },
    },
  });

  if (!invite) {
    throw new Error("Invite is invalid, expired, or already used.");
  }

  const email = (authedUser.email ?? "").trim().toLowerCase();
  if (!email || email !== invite.email.toLowerCase()) {
    throw new Error("This invite was created for a different email address.");
  }

  await prisma.user.upsert({
    where: { id: authedUser.id },
    update: { email },
    create: { id: authedUser.id, email },
  });

  await prisma.$transaction(async (tx) => {
    const existingMembership = await tx.budgetMember.findFirst({
      where: { budgetId: invite.budgetId, userId: authedUser.id },
    });
    if (existingMembership) {
      throw new Error("You are already a member of this budget.");
    }

    await tx.budgetMember.create({
      data: {
        budgetId: invite.budgetId,
        userId: authedUser.id,
        role: "member",
      },
    });

    await tx.budgetInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });
  });
}
