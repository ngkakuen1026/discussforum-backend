export interface addParentCategoryRequestBody {
    name: string;
}

export interface editParentCategoryRequestBody {
    name?: string;
}

export interface addCategoryRequestBody {
    name: string;
    parent_id: number;
}

export interface editCategoryRequestBody {
    name?: string;
    parent_id: number;
}