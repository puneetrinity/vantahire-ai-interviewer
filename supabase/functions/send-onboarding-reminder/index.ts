import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UserOnboardingData {
  user_id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  logo_url: string | null;
  created_at: string;
  has_jobs: boolean;
  has_candidates: boolean;
  has_completed_interview: boolean;
  has_branding: boolean;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!BREVO_API_KEY) {
      throw new Error("Missing BREVO_API_KEY secret");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Use service role key to access all user data
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting onboarding reminder check...");

    // Get users who signed up more than 24 hours ago but less than 7 days ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Get all profiles created in the window
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, full_name, company_name, logo_url, created_at")
      .gte("created_at", sevenDaysAgo)
      .lte("created_at", twentyFourHoursAgo);

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      throw profilesError;
    }

    if (!profiles || profiles.length === 0) {
      console.log("No eligible users found for onboarding reminders");
      return new Response(
        JSON.stringify({ message: "No users to remind", count: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${profiles.length} potential users for reminders`);

    // Check which users haven't received a reminder yet
    const userIds = profiles.map((p) => p.id);
    const { data: existingReminders } = await supabase
      .from("onboarding_reminders")
      .select("user_id")
      .in("user_id", userIds)
      .eq("reminder_type", "first_reminder");

    const remindedUserIds = new Set((existingReminders || []).map((r) => r.user_id));

    // Filter out users who already got a reminder
    const eligibleProfiles = profiles.filter((p) => !remindedUserIds.has(p.id));

    if (eligibleProfiles.length === 0) {
      console.log("All eligible users have already received reminders");
      return new Response(
        JSON.stringify({ message: "All users already reminded", count: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`${eligibleProfiles.length} users haven't received reminders yet`);

    // Get onboarding status for each user
    const usersToRemind: Array<{ profile: typeof profiles[0]; pendingTasks: string[] }> = [];

    for (const profile of eligibleProfiles) {
      // Check if user has jobs
      const { count: jobsCount } = await supabase
        .from("jobs")
        .select("*", { count: "exact", head: true })
        .eq("recruiter_id", profile.id);

      // Check if user has candidates/interviews
      const { count: interviewsCount } = await supabase
        .from("interviews")
        .select("*", { count: "exact", head: true })
        .eq("recruiter_id", profile.id);

      // Check if user has completed interviews
      const { count: completedCount } = await supabase
        .from("interviews")
        .select("*", { count: "exact", head: true })
        .eq("recruiter_id", profile.id)
        .eq("status", "completed");

      const pendingTasks: string[] = [];

      if (!jobsCount || jobsCount === 0) {
        pendingTasks.push("create_job");
      }
      if (!interviewsCount || interviewsCount === 0) {
        pendingTasks.push("add_candidate");
      }
      if (!completedCount || completedCount === 0) {
        pendingTasks.push("complete_interview");
      }
      if (!profile.logo_url && !profile.company_name) {
        pendingTasks.push("setup_branding");
      }

      // Only remind if there are pending tasks
      if (pendingTasks.length > 0) {
        usersToRemind.push({ profile, pendingTasks });
      }
    }

    console.log(`${usersToRemind.length} users have pending onboarding tasks`);

    let sentCount = 0;
    const errors: string[] = [];

    for (const { profile, pendingTasks } of usersToRemind) {
      if (!profile.email) {
        console.log(`Skipping user ${profile.id} - no email`);
        continue;
      }

      const taskLabels: Record<string, string> = {
        create_job: "Create your first job posting",
        add_candidate: "Invite a candidate to interview",
        complete_interview: "Complete your first AI interview",
        setup_branding: "Add your company branding",
      };

      const pendingTasksList = pendingTasks
        .map((task) => `<li style="margin-bottom: 8px;">${taskLabels[task] || task}</li>`)
        .join("");

      const userName = profile.full_name || "there";

      try {
        const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">Vantahire</h1>
            </div>
            
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px;">
              <h2 style="color: #1f2937; margin-top: 0;">Hey ${userName}! 👋</h2>
              
              <p style="color: #4b5563;">
                We noticed you haven't finished setting up your Vantahire account yet. 
                You're just a few steps away from running AI-powered interviews!
              </p>
              
              <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
                <h3 style="color: #1f2937; margin-top: 0;">Here's what's left to do:</h3>
                <ul style="color: #4b5563; padding-left: 20px;">
                  ${pendingTasksList}
                </ul>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="https://vantahire.lovable.app/dashboard" 
                   style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                  Complete Setup →
                </a>
              </div>
              
              <p style="color: #6b7280; font-size: 14px;">
                Need help? Just reply to this email and we'll get back to you.
              </p>
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
              
              <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                You're receiving this because you signed up for Vantahire.<br>
                © ${new Date().getFullYear()} Vantahire. All rights reserved.
              </p>
            </div>
          </body>
          </html>
        `;

        // Send email using Brevo API
        const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": BREVO_API_KEY,
          },
          body: JSON.stringify({
            sender: {
              name: "Vantahire",
              email: "hello@vantahire.com",
            },
            to: [
              {
                email: profile.email,
                name: userName,
              },
            ],
            subject: "Complete your Vantahire setup - Just a few steps left! 🚀",
            htmlContent,
          }),
        });

        if (!emailResponse.ok) {
          const errorData = await emailResponse.json();
          console.error("Brevo API error:", errorData);
          throw new Error(errorData.message || "Failed to send email via Brevo");
        }

        const responseData = await emailResponse.json();
        console.log(`Email sent to ${profile.email} via Brevo:`, responseData);

        // Record that we sent a reminder
        const { error: insertError } = await supabase
          .from("onboarding_reminders")
          .insert({
            user_id: profile.id,
            reminder_type: "first_reminder",
            tasks_pending: pendingTasks,
          });

        if (insertError) {
          console.error(`Failed to record reminder for ${profile.id}:`, insertError);
        }

        sentCount++;
      } catch (emailError: any) {
        console.error(`Failed to send email to ${profile.email}:`, emailError);
        errors.push(`${profile.email}: ${emailError.message}`);
      }
    }

    console.log(`Onboarding reminder job complete. Sent ${sentCount} emails.`);

    return new Response(
      JSON.stringify({
        message: "Onboarding reminders processed",
        sent: sentCount,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-onboarding-reminder:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});