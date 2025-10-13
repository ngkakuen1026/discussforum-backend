export interface CreatePostRequestBody {
    title: string;
    content: string;
    categoryId: number;
    tag?: string;
}

export interface VoteRequestBody {
    voteType: number;
}