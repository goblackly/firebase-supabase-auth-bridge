import { supabase } from '../supabase';

type AccountEmailPayload =
  | {
      type: 'member-welcome';
      payload: {
        email: string;
        lastName: string;
      };
    }
  | {
      type: 'admin-new-user';
      payload: {
        firstName: string;
        lastName: string;
        email: string;
      };
    };

type AppNotificationPayload =
  | {
      type: 'admin-new-submission';
      payload: {
        memberName: string;
        businessName: string;
        amount: number;
      };
    }
  | {
      type: 'member-submission-received';
      payload: {
        email: string;
        lastName: string;
        businessName: string;
        amount: number;
      };
    }
  | {
      type: 'member-submission-approved';
      payload: {
        email: string;
        lastName: string;
        businessName: string;
        amount: number;
      };
    }
  | {
      type: 'member-submission-rejected';
      payload: {
        email: string;
        lastName: string;
        businessName: string;
        amount: number;
        adminNote?: string;
      };
    };

async function invokeFunction<T>(name: string, body: T) {
  const { error } = await supabase.functions.invoke(name, { body });
  if (error) {
    throw error;
  }
}

async function sendAccountEmail(body: AccountEmailPayload) {
  await invokeFunction('send-account-email', body);
}

async function sendAppNotification(body: AppNotificationPayload) {
  await invokeFunction('send-admin-notification', body);
}

function logNotificationError(context: string, error: unknown) {
  console.error(`Failed to send ${context}:`, error);
}

export const notificationService = {
  async notifyAdminNewUser(userData: { firstName: string; lastName: string; email: string }) {
    try {
      await sendAccountEmail({
        type: 'admin-new-user',
        payload: userData,
      });
    } catch (error) {
      logNotificationError('admin new-user email', error);
    }
  },

  async notifyMemberWelcome(memberData: { email: string; lastName: string }) {
    try {
      await sendAccountEmail({
        type: 'member-welcome',
        payload: memberData,
      });
    } catch (error) {
      logNotificationError('member welcome email', error);
    }
  },

  async requestPasswordResetEmail(email: string) {
    await invokeFunction('send-password-reset-email', {
      email,
      type: 'password-reset',
    });
  },

  async notifyMemberAdminCreatedAccount(memberData: { email: string }) {
    try {
      await invokeFunction('send-password-reset-email', {
        email: memberData.email,
        type: 'admin-created-account',
      });
    } catch (error) {
      logNotificationError('member admin-created account email', error);
    }
  },

  async notifyAdminNewSubmission(submissionData: { memberName: string; businessName: string; amount: number }) {
    try {
      await sendAppNotification({
        type: 'admin-new-submission',
        payload: submissionData,
      });
    } catch (error) {
      logNotificationError('admin new-submission email', error);
    }
  },

  async notifyMemberSubmissionReceived(submissionData: {
    email: string;
    lastName: string;
    businessName: string;
    amount: number;
  }) {
    try {
      await sendAppNotification({
        type: 'member-submission-received',
        payload: submissionData,
      });
    } catch (error) {
      logNotificationError('member submission-received email', error);
    }
  },

  async notifyMemberSubmissionApproved(submissionData: {
    email: string;
    lastName: string;
    businessName: string;
    amount: number;
  }) {
    try {
      await sendAppNotification({
        type: 'member-submission-approved',
        payload: submissionData,
      });
    } catch (error) {
      logNotificationError('member submission-approved email', error);
    }
  },

  async notifyMemberSubmissionRejected(submissionData: {
    email: string;
    lastName: string;
    businessName: string;
    amount: number;
    adminNote?: string;
  }) {
    try {
      await sendAppNotification({
        type: 'member-submission-rejected',
        payload: submissionData,
      });
    } catch (error) {
      logNotificationError('member submission-rejected email', error);
    }
  },
};
