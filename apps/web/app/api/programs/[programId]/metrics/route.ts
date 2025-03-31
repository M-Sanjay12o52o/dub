import { getStartEndDates } from "@/lib/analytics/utils/get-start-end-dates";
import { getProgramOrThrow } from "@/lib/api/programs/get-program-or-throw";
import { withWorkspace } from "@/lib/auth";
import {
  getProgramMetricsQuerySchema,
  ProgramMetricsSchema,
} from "@/lib/zod/schemas/programs";
import { prisma } from "@dub/prisma";
import { NextResponse } from "next/server";

// GET /api/programs/[programId]/metrics - get metrics for a program
export const GET = withWorkspace(
  async ({ workspace, params, searchParams }) => {
    const { interval, start, end } =
      getProgramMetricsQuerySchema.parse(searchParams);
    const { startDate, endDate } = getStartEndDates({ interval, start, end });

    const program = await getProgramOrThrow({
      workspaceId: workspace.id,
      programId: params.programId,
    });

    const where = {
      programId: program.id,
      createdAt: {
        gte: startDate.toISOString(),
        lte: endDate.toISOString(),
      },
    };

    const [payouts, revenue, earnings, salesCount, partnersCount] =
      await Promise.all([
        prisma.payout.aggregate({
          where,
          _sum: {
            amount: true,
          },
        }),

        prisma.commission.aggregate({
          where: {
            earnings: {
              gt: 0,
            },
            ...where,
          },
          _sum: {
            amount: true,
          },
        }),

        prisma.commission.aggregate({
          where: {
            earnings: {
              gt: 0,
            },
            ...where,
          },
          _sum: {
            earnings: true,
          },
        }),

        prisma.commission.count({
          where: {
            earnings: {
              gt: 0,
            },
            ...where,
          },
        }),

        prisma.programEnrollment.count({
          where: {
            programId: program.id,
          },
        }),
      ]);

    const response = ProgramMetricsSchema.parse({
      partners: partnersCount,
      sales: salesCount,
      revenue: revenue._sum.amount || 0,
      earnings: earnings._sum.earnings || 0,
      payouts: payouts._sum.amount || 0,
    });

    return NextResponse.json(response);
  },
);
