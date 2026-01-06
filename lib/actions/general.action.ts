"use server";

import { generateObject } from "ai";
import { google } from "@ai-sdk/google";

import { db } from "@/firebase/admin";
import { feedbackSchema } from "@/constants";

/* ---------------------------------- */
/* CREATE FEEDBACK */
/* ---------------------------------- */
export async function createFeedback(params: CreateFeedbackParams) {
  const { interviewId, userId, transcript, feedbackId } = params;

  try {
    const formattedTranscript = transcript
      .map(
        (sentence: { role: string; content: string }) =>
          `- ${sentence.role}: ${sentence.content}\n`
      )
      .join("");

    const { object } = await generateObject({
      model: google("gemini-2.0-flash-001", {
        structuredOutputs: false,
      }),
      schema: feedbackSchema,
      prompt: `
You are an AI interviewer analyzing a mock interview.
Be strict, detailed, and point out all weaknesses.

Transcript:
${formattedTranscript}

Score ONLY these categories (0–100):
- Communication Skills
- Technical Knowledge
- Problem-Solving
- Cultural & Role Fit
- Confidence & Clarity
`,
      system:
        "You are a professional interviewer analyzing a mock interview.",
    });

    const feedback = {
      interviewId,
      userId,
      totalScore: object.totalScore,
      categoryScores: object.categoryScores,
      strengths: object.strengths,
      areasForImprovement: object.areasForImprovement,
      finalAssessment: object.finalAssessment,
      createdAt: new Date().toISOString(),
    };

    const feedbackRef = feedbackId
      ? db.collection("feedback").doc(feedbackId)
      : db.collection("feedback").doc();

    await feedbackRef.set(feedback);

    return { success: true, feedbackId: feedbackRef.id };
  } catch (error) {
    console.error("Error saving feedback:", error);
    return { success: false };
  }
}

/* ---------------------------------- */
/* GET INTERVIEW BY ID */
/* ---------------------------------- */
export async function getInterviewById(
  id: string
): Promise<Interview | null> {
  const doc = await db.collection("interviews").doc(id).get();
  if (!doc.exists) return null;

  return { id: doc.id, ...doc.data() } as Interview;
}

/* ---------------------------------- */
/* GET FEEDBACK BY INTERVIEW ID */
/* ---------------------------------- */
export async function getFeedbackByInterviewId(
  params: GetFeedbackByInterviewIdParams
): Promise<Feedback | null> {
  const { interviewId, userId } = params;

  const snapshot = await db
    .collection("feedback")
    .where("interviewId", "==", interviewId)
    .where("userId", "==", userId)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as Feedback;
}

/* ---------------------------------- */
/* GET LATEST INTERVIEWS (🔥 FINAL FIX) */
/* NO orderBy + NO != + NO INDEX */
/* ---------------------------------- */
export async function getLatestInterviews(
  params: GetLatestInterviewsParams
): Promise<Interview[]> {
  const { userId, limit = 20 } = params;

  const snapshot = await db
    .collection("interviews")
    .where("finalized", "==", true)
    .limit(limit)
    .get();

  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    // remove own interviews
    .filter((interview) => interview.userId !== userId)
    // sort latest in JS (NO Firestore index)
    .sort(
      (a: any, b: any) =>
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
    ) as Interview[];
}

/* ---------------------------------- */
/* GET INTERVIEWS BY USER ID */
/* ---------------------------------- */
export async function getInterviewsByUserId(
  userId: string
): Promise<Interview[]> {
  const snapshot = await db
    .collection("interviews")
    .where("userId", "==", userId)
    .get();

  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .sort(
      (a: any, b: any) =>
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
    ) as Interview[];
}
