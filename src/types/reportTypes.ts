export interface ReportRequestBody {
    contentType: 'post' | 'comment';
    reason: 'spam' | 'harassment' | 'hate speech' | 'inappropriate content' |
    'impersonation' | 'misinformation' | 'threatening behavior' |
    'copyright violation' | 'self-harm or suicide' | 'scam or fraud' |
    'other';
    customReason?: string;
    additionalComments?: string;
}

export interface ResolveReportRequestBody {
    status: 'pending' | 'under_review' | 'resolved' | 'rejected';
}