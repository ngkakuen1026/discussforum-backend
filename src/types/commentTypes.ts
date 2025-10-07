export interface CreateCommentRequestBody {
    content: string;
}

export interface VoteRequestBody {
    voteType: number;
}

export interface CreateReplyRequestBody {
    content: string;
}