import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { supabase } from '../supabase';

type AdminNotificationPayload =
  | {
      type: 'new-user';
      payload: {
        firstName: string;
        lastName: string;
        email: string;
      };
    }
  | {
      type: 'new-submission';
      payload: {
        userName: string;
        businessName: string;
        amount: number;
      };
    };

async function sendAdminNotification(body: AdminNotificationPayload) {
  const { error } = await supabase.functions.invoke('send-admin-notification', {
    body,
  });

  if (error) {
    throw error;
  }
}

async function fallbackToFirebaseMail(body: AdminNotificationPayload) {
  const mailDocument = body.type === 'new-user'
    ? {
        to: 'info@goblackly.com',
        message: {
          subject: 'New User Registration - Sigma Spend Initiative',
          html: `
            <div style="font-family: sans-serif; padding: 20px; color: #333;">
              <h2 style="color: #002366;">New User Registration</h2>
              <p>A new member has joined the Sigma Spend Initiative:</p>
              <ul style="list-style: none; padding: 0;">
                <li><strong>Name:</strong> ${body.payload.firstName} ${body.payload.lastName}</li>
                <li><strong>Email:</strong> ${body.payload.email}</li>
              </ul>
              <p>You can manage users in the Admin Dashboard.</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="font-size: 12px; color: #666;">Bigger & Better Business - Kappa Upsilon Sigma Chapter</p>
            </div>
          `,
        },
        timestamp: serverTimestamp(),
      }
    : {
        to: 'info@goblackly.com',
        message: {
          subject: 'New Receipt Submission - Action Required',
          html: `
            <div style="font-family: sans-serif; padding: 20px; color: #333;">
              <h2 style="color: #002366;">New Receipt for Review</h2>
              <p>A new receipt has been submitted and is pending approval:</p>
              <ul style="list-style: none; padding: 0;">
                <li><strong>Member:</strong> ${body.payload.userName}</li>
                <li><strong>Business:</strong> ${body.payload.businessName}</li>
                <li><strong>Amount:</strong> $${body.payload.amount.toLocaleString()}</li>
              </ul>
              <p>Please log in to the Admin Dashboard to approve or reject this submission.</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="font-size: 12px; color: #666;">Bigger & Better Business - Kappa Upsilon Sigma Chapter</p>
            </div>
          `,
        },
        timestamp: serverTimestamp(),
      };

  await addDoc(collection(db, 'mail'), mailDocument);
}

export const notificationService = {
  async notifyAdminNewUser(userData: { firstName: string; lastName: string; email: string }) {
    const body: AdminNotificationPayload = {
      type: 'new-user',
      payload: userData,
    };

    try {
      await sendAdminNotification(body);
    } catch (error) {
      console.error('Supabase admin notification failed (new user), falling back to Firebase mail:', error);

      try {
        await fallbackToFirebaseMail(body);
      } catch (fallbackError) {
        console.error('Failed to send admin notification (new user):', fallbackError);
      }
    }
  },

  async notifyAdminNewSubmission(submissionData: { userName: string; businessName: string; amount: number }) {
    const body: AdminNotificationPayload = {
      type: 'new-submission',
      payload: submissionData,
    };

    try {
      await sendAdminNotification(body);
    } catch (error) {
      console.error('Supabase admin notification failed (new submission), falling back to Firebase mail:', error);

      try {
        await fallbackToFirebaseMail(body);
      } catch (fallbackError) {
        console.error('Failed to send admin notification (new submission):', fallbackError);
      }
    }
  }
};
