import { NextResponse } from "next/server";
import { z } from "zod";
import { publishAnnouncement } from "@/lib/supabase/announcements";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// HTTP entry point for publishing. The work, including every permission check,
// happens in the publish_announcement database function as one transaction
// (supabase/migrations/*_announcement_publishing.sql). This route runs it with
// the caller's own session, so it needs no service-role secret. The browser
// calls the same function directly through lib/supabase/announcements.ts.

const requestSchema = z.object({
  clientRequestId: z.string().uuid(),
  organizationId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  body: z.string().trim().min(1).max(5_000),
  priority: z.enum(["normal", "important", "urgent"]),
  audience: z.object({
    wholeOrganization: z.boolean(),
    groupIds: z.array(z.string().uuid()).max(100),
    membershipIds: z.array(z.string().uuid()).max(500),
    excludedMembershipIds: z.array(z.string().uuid()).max(500),
  }),
  smsFallbackAfterMinutes: z.union([z.literal(5), z.literal(15), z.literal(30), z.literal(60), z.null()]),
}).strict();

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "The announcement or audience selection is invalid." }, { status: 400 });
  }

  const input = parsed.data;
  try {
    const result = await publishAnnouncement(supabase, input.organizationId, {
      clientRequestId: input.clientRequestId,
      title: input.title,
      body: input.body,
      priority: input.priority,
      audienceLabel: "",
      audience: input.audience,
      recipientIds: [],
      smsFallbackMinutes: input.smsFallbackAfterMinutes,
    });
    return NextResponse.json(
      { announcementId: result.announcementId, status: "published", recipientCount: result.recipientCount, duplicate: result.duplicate },
      { status: result.duplicate ? 200 : 201 }
    );
  } catch (error) {
    // publishAnnouncement turns database refusals into plain explanations; nothing was published.
    return NextResponse.json({ error: error instanceof Error ? error.message : "The announcement could not be published." }, { status: 422 });
  }
}
