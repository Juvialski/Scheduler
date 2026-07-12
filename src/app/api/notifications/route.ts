import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, updateDoc, doc, Timestamp } from "firebase/firestore";
import * as Brevo from "@getbrevo/brevo";
import { DateTime } from "luxon";

// Note: Brevo SDK v3+ uses named exports differently.
// If TransactionalEmailsApi is not found, we might need to use a different approach or verify the version.
// Looking at the error, it seems it doesn't find the classes.

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = DateTime.now();
    // Logic: Look for sessions starting between 5 minutes and 35 mins from now.
    // This allows us to send a reminder very close to the meeting start.
    const startRange = now.plus({ minutes: 0 });
    const endRange = now.plus({ minutes: 30 });

    const q = query(
      collection(db, "bookings"),
      where("startTime", ">=", Timestamp.fromDate(startRange.toJSDate())),
      where("startTime", "<=", Timestamp.fromDate(endRange.toJSDate())),
      where("notified", "==", false)
    );

    const snapshot = await getDocs(q);

    for (const d of snapshot.docs) {
      const booking = d.data();
      const startTime = DateTime.fromJSDate(booking.startTime.toDate()).setZone("Asia/Manila");
      const startTimePST = startTime.setZone("America/Los_Angeles");

      const content = `Hi ${booking.clientName}, your tutoring session for ${booking.childName} is scheduled for ${startTimePST.toFormat("ff")} (PST) / ${startTime.toFormat("ff")} (PH).`;
      const tutorContent = `You have a session with ${booking.childName} (${booking.clientName}) at ${startTime.toFormat("ff")} (PH).`;

      // Send Email to Client
      await sendEmailViaApi(
        booking.clientEmail,
        booking.clientName,
        "Upcoming Tutoring Session Reminder",
        content
      );

      // Send Email to Tutor
      await sendEmailViaApi(
        process.env.NEXT_PUBLIC_TUTOR_EMAIL || "",
        "Tutor",
        "Upcoming Tutoring Session Reminder",
        tutorContent
      );

      await updateDoc(doc(db, "bookings", d.id), { notified: true });
    }

    return NextResponse.json({ success: true, count: snapshot.size });
  } catch (error: any) {
    console.error("Notification error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function sendEmailViaApi(toEmail: string, toName: string, subject: string, content: string) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error("BREVO_API_KEY not set");

  // Using fetch directly as a fallback if the SDK is problematic in the build
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "api-key": apiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      sender: {
        name: process.env.BREVO_SENDER_NAME || "Tutoring Scheduler",
        email: process.env.BREVO_SENDER_EMAIL || "noreply@example.com"
      },
      to: [{ email: toEmail, name: toName }],
      subject: subject,
      htmlContent: `<html><body><p>${content}</p></body></html>`
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Brevo API error: ${JSON.stringify(errorData)}`);
  }

  return response.json();
}
