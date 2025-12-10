export interface RegisterRequestBody {
    username: string;
    email: string;
    password: string;
    first_name?: string;
    last_name?: string;
    phone?: string; 
    gender: 'Male' | 'Female' | 'Prefer Not to Say'; 
    bio?: string;   
    is_admin?: boolean;
}

export interface LoginRequestBody {
    email: string;
    password: string;
}