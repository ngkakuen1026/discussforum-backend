export interface EditProfileRequestBody {
    username?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    gender?: string;
    bio?: string;
}

export interface EditPasswordRequestBody {
    oldPassword: string;
    newPassword: string;
}