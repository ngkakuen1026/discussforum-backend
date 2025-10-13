export interface CreateTagRequestBody {
    name: string;
}

export interface LinkTagToPostRequestBody {
    postId: number;
    tagId: number;
}