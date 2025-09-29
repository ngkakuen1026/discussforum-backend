export interface CreatePostRequestBody {
    title: string;
    content: string;
    categoryId?: number;
}

export interface VoteRequestBody {
    voteType: number;
}