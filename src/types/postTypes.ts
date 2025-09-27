export interface CreatePostRequestBody {
    title: string;
    content: string;
    categoryId?: number;
}

export interface EditPostRequestBody {
    title?: string;
    content?: string;
    categoryId?: number;
}