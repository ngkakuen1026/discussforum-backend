jest.mock('../../db/db', () => ({ __esModule: true, default: { query: jest.fn() } }));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

jest.mock('../../middleware/auth', () => ({
    __esModule: true,
    isAuthenticated: (req: any, _res: any, next: any) => {
        const marker = req.headers['x-test-user'] || req.headers['authorization'];
        if (marker === 'test-user') {
            req.user = { id: 99 };
            return next();
        }
        return _res.status(401).json({ message: 'Unauthorized' });
    }
}));
jest.mock('../../middleware/isAdmin', () => ({
    __esModule: true,
    isAdmin: (_req: any, _res: any, next: any) => next()
}));

jest.mock('../../config/cloudinary', () => ({ __esModule: true, default: { uploader: { upload: jest.fn(), destroy: jest.fn() } } }));
jest.mock('../../utils/extractCloudinaryUrl', () => ({ __esModule: true, extractPublicId: jest.fn(() => 'public-id') }));
jest.mock('../../utils/notificationUtils', () => ({ __esModule: true, createNotification: jest.fn() }));

import request from 'supertest';
import app from '../../app';
import poolDefault from '../../db/db';
import cloudinary from '../../config/cloudinary';
import fs from 'fs';
import { extractPublicId } from '../../utils/extractCloudinaryUrl';
import { createNotification } from '../../utils/notificationUtils';

const pool = poolDefault as unknown as { query: jest.Mock };
const cloudUpload = (cloudinary as any).uploader.upload as jest.Mock;
const cloudDestroy = (cloudinary as any).uploader.destroy as jest.Mock;
const fsExists = (fs as any).existsSync as jest.Mock;
const fsUnlink = (fs as any).unlinkSync as jest.Mock;
const extractPub = extractPublicId as jest.Mock;
const createNotif = createNotification as jest.Mock;

describe('Admin controllers - integration tests (supertest) with mocked DB and cloudinary', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    describe('User related routes', () => {
        describe('GET /users/all-users (Get all users)', () => {
            it('GET /users/all-users -> 200 returns users without password_hash', async () => {
                pool.query.mockResolvedValueOnce({ rows: [{ id: 1, username: 'u1', password_hash: 'h' }] });

                const res = await request(app)
                    .get('/api/v1/admin/users/all-users')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(200);
                expect(res.body.users).toEqual([{ id: 1, username: 'u1' }]);
                expect(pool.query).toHaveBeenCalledWith('SELECT * FROM users');
            });
        });

        describe('GET /users/search-users (Search user)', () => {
            it('GET /users/search-users -> 400 when query missing', async () => {
                const res = await request(app)
                    .get('/api/v1/admin/users/search-users')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(400);
                expect(res.body).toEqual({ message: 'Search query is required' });
            });

            it('GET /users/search-users -> 200 returns matched users', async () => {
                pool.query.mockResolvedValueOnce({ rows: [{ id: 2, username: 'bob', password_hash: 'x' }] });

                const res = await request(app)
                    .get('/api/v1/admin/users/search-users')
                    .set('x-test-user', 'test-user').query({ query: 'bob' });

                expect(res.status).toBe(200);
                expect(res.body.users[0]).toMatchObject({ id: 2, username: 'bob' });
                expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM users WHERE users.username ILIKE $1'), ['%bob%']);
            });
        });

        describe('GET /users/user/profile/:userId (View specific user profile)', () => {
            it('GET /users/user/profile/:userId -> 404 when not found', async () => {
                pool.query.mockResolvedValueOnce({ rows: [] });

                const res = await request(app)
                    .get('/api/v1/admin/users/user/profile/999')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(404);
                expect(res.body).toEqual({ message: 'User not found' });
            });

            it('GET /users/user/profile/:userId -> 200 returns user (no password_hash)', async () => {
                pool.query.mockResolvedValueOnce({ rows: [{ id: 10, username: 'alice', password_hash: 'h' }] });

                const res = await request(app)
                    .get('/api/v1/admin/users/user/profile/10')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(200);
                expect(res.body.user).toMatchObject({ id: 10, username: 'alice' });
                expect(res.body.user.password_hash).toBeUndefined();
                expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM users WHERE id = $1'), [10]);
            });
        });

        describe('PATCH /users/user/profile/:userId (Edit specific user profile)', () => {
            it('PATCH /users/user/profile/:userId -> 404 when user not found', async () => {
                pool.query.mockResolvedValueOnce({ rowCount: 0 });

                const payload = { username: 'x' };
                const res = await request(app)
                    .patch('/api/v1/admin/users/user/profile/5')
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(404);
                expect(res.body).toEqual({ message: 'User not found' });
            });

            it('PATCH /users/user/profile/:userId -> 200 updates and notifies', async () => {
                pool.query
                    .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 5, username: 'old' }] })
                    .mockResolvedValueOnce({ rows: [{ id: 5, username: 'new' }] })
                    .mockResolvedValueOnce({ rows: [{ username: 'adminName' }] });

                const payload = { username: 'new' };
                const res = await request(app)
                    .patch('/api/v1/admin/users/user/profile/5')
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(200);
                expect(res.body.user).toMatchObject({ id: 5, username: 'new' });
                expect(createNotif).toHaveBeenCalledWith(5, expect.stringContaining('edited by admin adminName'), 'profile_edited', 5);
            });
        });

        describe('POST /users/user/profile/:userId/profile-image (Upload user profile image)', () => {
            it('POST /users/user/profile/:userId/profile-image -> 400 when no file uploaded', async () => {
                const res = await request(app)
                    .post('/api/v1/admin/users/user/profile/5/profile-image')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(400);
                expect(res.body).toEqual({ message: 'No file uploaded' });
            });

            it('POST /users/user/profile/:userId/profile-image -> 404 when user not found and unlink tmp file', async () => {
                pool.query.mockResolvedValueOnce({ rows: [] });

                const res = await request(app)
                    .post('/api/v1/admin/users/user/profile/999/profile-image')
                    .set('x-test-user', 'test-user')
                    .send();
                expect(res.status).toBe(400);
            });
        });

        describe('DELETE /users/user/profile/:userId/profile-image (Delete user profile image)', () => {
            it('DELETE /users/user/profile/:userId/profile-image -> 404 when user not found', async () => {
                pool.query.mockResolvedValueOnce({ rows: [] });

                const res = await request(app)
                    .delete('/api/v1/admin/users/user/profile/55/profile-image')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(404);
                expect(res.body).toEqual({ message: 'User not found' });
                expect(createNotif).not.toHaveBeenCalledWith();
            });

            it('DELETE /users/user/profile/:userId/profile-image -> 200 when image deleted and db updated', async () => {
                pool.query
                    .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // User exists
                    .mockResolvedValueOnce({ rows: [{ profile_image: 'https://cloudinary/.../img.jpg' }] })
                    .mockResolvedValueOnce({})
                    .mockResolvedValueOnce({ rows: [{ username: 'adminName' }] })

                extractPub.mockReturnValueOnce('public-id');
                cloudDestroy.mockResolvedValueOnce({});

                const res = await request(app)
                    .delete('/api/v1/admin/users/user/profile/5/profile-image')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(200);
                expect(res.body).toEqual({ message: 'Image deleted successfully' });
                expect(cloudDestroy).toHaveBeenCalledWith('public-id');
                expect(pool.query).toHaveBeenCalledWith("UPDATE users SET profile_image = NULL WHERE id = $1", [5]);
                expect(createNotif).toHaveBeenCalledWith(5, expect.stringContaining('Your profile image has been deleted by admin adminName'), 'profile_image_deleted', 5);
            });
        });

        describe('DELETE /users/user/profile/:userId (Delete user account)', () => {
            it('DELETE /users/user/profile/:userId -> 404 when user not found', async () => {
                pool.query.mockResolvedValueOnce({ rowCount: 0 });

                const res = await request(app)
                    .delete('/api/v1/admin/users/user/profile/77')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(404);
                expect(res.body).toEqual({ message: 'User not found' });
            });

            it('DELETE /users/user/profile/:userId -> 200 deletes, notifies followers, destroys image (cleanup path)', async () => {
                pool.query
                    .mockResolvedValueOnce({ rowCount: 1, rows: [{ profile_image: 'https://cloudinary/.../img.jpg', username: 'delUser' }] })
                    .mockResolvedValueOnce({ rows: [{ follower_id: 21 }, { follower_id: 22 }] })
                    .mockResolvedValueOnce({ rows: [{ username: 'adminName' }] })
                    .mockResolvedValueOnce({});

                extractPub.mockReturnValueOnce('public-id');
                cloudDestroy.mockResolvedValueOnce({});

                const res = await request(app)
                    .delete('/api/v1/admin/users/user/profile/66')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(200);
                expect(res.body).toEqual({ message: 'User account deleted successfully' });
                expect(createNotif).toHaveBeenCalledTimes(2);
                expect(cloudDestroy).toHaveBeenCalledWith('public-id');
                expect(pool.query).toHaveBeenCalledWith("DELETE FROM users WHERE id = $1", [66]);
            });
        });
    });

    describe('Post related routes', () => {
        describe('DELETE /posts/post/:postId (Delete user post)', () => {
            it('DELETE /posts/post/:postId -> 404 when not found', async () => {
                pool.query.mockResolvedValueOnce({ rowCount: 0 });

                const res = await request(app)
                    .delete('/api/v1/admin/posts/post/999')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(404);
                expect(res.body).toEqual({ message: 'Post not found' });
            });

            it('DELETE /posts/post/:postId -> 200 deletes and notifies owner', async () => {
                pool.query
                    .mockResolvedValueOnce({ rowCount: 1, rows: [{ user_id: 12, title: 'T' }] })
                    .mockResolvedValueOnce({ rows: [{ username: 'adminName' }] })
                    .mockResolvedValueOnce({});

                const res = await request(app)
                    .delete('/api/v1/admin/posts/post/5')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(200);
                expect(res.body).toEqual({ message: 'Post deleted successfully' });
                expect(createNotif).toHaveBeenCalledWith(12, expect.stringContaining('deleted by admin adminName'), 'post_deleted', 5);
                expect(pool.query).toHaveBeenCalledWith('DELETE FROM posts WHERE id = $1', [5]);
            });
        });
    });

    describe('Comment related routes', () => {
        describe('DELETE /comments/comment/:commentId (Delete user comment)', () => {
            it('DELETE /comments/comment/:commentId -> 404 when not found', async () => {
                pool.query.mockResolvedValueOnce({ rowCount: 0 });

                const res = await request(app)
                    .delete('/api/v1/admin/comments/comment/999')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(404);
                expect(res.body).toEqual({ message: 'Comment not found' });
            });

            it('DELETE /comments/comment/:commentId -> 200 deletes and notifies owner', async () => {
                pool.query
                    .mockResolvedValueOnce({ rowCount: 1, rows: [{ user_id: 13, content: 'hi' }] })
                    .mockResolvedValueOnce({ rows: [{ username: 'adminName' }] })
                    .mockResolvedValueOnce({});

                const res = await request(app)
                    .delete('/api/v1/admin/comments/comment/7')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(200);
                expect(res.body).toEqual({ message: 'Comment deleted successfully' });
                expect(createNotif).toHaveBeenCalledWith(13, expect.stringContaining('deleted by admin adminName'), 'comment_deleted', 7);
                expect(pool.query).toHaveBeenCalledWith('DELETE FROM comments WHERE id = $1', [7]);
            });
        });
    });

    describe('Parent Category related routes', () => {
        describe('POST /parent-categories/parent-category (Create parent category)', () => {
            it('POST /parent-categories/parent-category -> 400 when name too short', async () => {
                const payload = { name: 'a' };

                const res = await request(app)
                    .post('/api/v1/admin/parent-categories/parent-category')
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(400);
            });

            it('POST /parent-categories/parent-category -> 409 when already exists', async () => {
                const payload = { name: 'Sports' };
                pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

                const res = await request(app)
                    .post('/api/v1/admin/parent-categories/parent-category')
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(409);
                expect(res.body).toEqual({ message: 'Parent category already exists' });
            });

            it('POST /parent-categories/parent-category -> 201 when created', async () => {
                const payload = { name: 'Sports' };
                pool.query.mockResolvedValueOnce({ rows: [] })
                    .mockResolvedValueOnce({ rows: [{ id: 11, name: 'SPORTS' }] });

                const res = await request(app)
                    .post('/api/v1/admin/parent-categories/parent-category')
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(201);
                expect(res.body.parentCategory).toMatchObject({ id: 11 });
                expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO parent_categories'), ['SPORTS']);
            });
        });

        describe('PATCH /parent-categories/parent-category/:parentCategoryId (Edit parent category)', () => {
            it('PATCH /parent-categories/parent-category/:parentCategoryId -> 404 when not found', async () => {
                const parentCategoryId = 99;
                const payload = { name: 'NewName' };
                pool.query.mockResolvedValueOnce({ rowCount: 0 });

                const res = await request(app)
                    .patch(`/api/v1/admin/parent-categories/parent-category/${parentCategoryId}`)
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(404);
                expect(res.body).toEqual({ message: 'Parent category not found' });
            });

            it('PATCH /parent-categories/parent-category/:parentCategoryId -> 200 when updated', async () => {
                const parentCategoryId = 5;
                const payload = { name: 'NewName' };
                pool.query.mockResolvedValueOnce({ rows: [{ id: 5, name: 'OLD' }] })
                    .mockResolvedValueOnce({ rows: [] });

                const res = await request(app)
                    .patch(`/api/v1/admin/parent-categories/parent-category/${parentCategoryId}`)
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(200);
                expect(res.body.parentCategory).toMatchObject({ id: 5, newName: 'NewName' });
                expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE parent_categories SET name = $1 WHERE id = $2'), ['NEWNAME', 5]);
            });
        });

        describe('DELETE /parent-categories/parent-category/:parentCategoryId (Delete parent category)', () => {
            it('DELETE /parent-categories/parent-category/:parentCategoryId -> 404 when not found', async () => {
                pool.query.mockResolvedValueOnce({ rowCount: 0 });

                const res = await request(app)
                    .delete('/api/v1/admin/parent-categories/parent-category/99')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(404);
                expect(res.body).toEqual({ message: 'Parent category not found' });
            });

            it('DELETE /parent-categories/parent-category/:parentCategoryId -> 200 when deleted successfully', async () => {
                pool.query.mockResolvedValueOnce({ rows: [{ id: 5, name: 'OLD_CATEGORY' }] })
                    .mockResolvedValueOnce({})
                    .mockResolvedValueOnce({});

                const res = await request(app)
                    .delete('/api/v1/admin/parent-categories/parent-category/5')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(200);
                expect(res.body).toEqual({ message: 'Parent Category deleted successfully' });
                expect(pool.query).toHaveBeenCalledWith('DELETE FROM parent_categories WHERE id = $1', [5]);
            });
        });
    });


    describe('Category related routes', () => {
        describe('POST /categories/category (Create category)', () => {
            it('POST /categories/category -> 400 when name too short', async () => {
                const payload = { name: 'a' };
                const res = await request(app)
                    .post('/api/v1/admin/categories/category')
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(400);
                expect(res.body).toEqual({ message: "Category name is required and must be at least 2 characters long" });
            });

            it('POST /categories/category -> 400 when invalid parent_id', async () => {
                pool.query.mockResolvedValueOnce({ rowCount: 0 });

                const payload = { name: 'Sports', parent_id: 999 };
                const res = await request(app)
                    .post('/api/v1/admin/categories/category')
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(400);
                expect(res.body).toEqual({ message: "Invalid parent category ID" });
            });

            it('POST /categories/category -> 409 when already exists', async () => {
                pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Simulate existing category

                const payload = { name: 'Sports' };
                const res = await request(app)
                    .post('/api/v1/admin/categories/category')
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(409);
                expect(res.body).toEqual({ message: "Category already exists" });
            });

            it('POST /categories/category -> 201 when created', async () => {
                pool.query
                    .mockResolvedValueOnce({ rowCount: 0 }) // No existing category
                    .mockResolvedValueOnce({ rows: [{ id: 11, name: 'SPORTS' }] }); // Simulate category creation

                const payload = { name: 'Sports' };
                const res = await request(app)
                    .post('/api/v1/admin/categories/category')
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(201);
                expect(res.body.category).toMatchObject({ id: 11 });
                expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO categories'), ['SPORTS', undefined]);
            });
        });

        describe('PATCH /categories/category/:categoryId (Edit category)', () => {
            it('PATCH /categories/category/:categoryId -> 404 when not found', async () => {
                pool.query.mockResolvedValueOnce({ rowCount: 0 });

                const payload = { name: 'NewName' };
                const res = await request(app)
                    .patch('/api/v1/admin/categories/category/99')
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(404);
                expect(res.body).toEqual({ message: 'Category not found' });
            });

            it('PATCH /categories/category/:categoryId -> 400 when name too short', async () => {
                pool.query.mockResolvedValueOnce({ rows: [{ id: 5, name: 'OLD' }] }); // Simulate existing category

                const payload = { name: 'a' };
                const res = await request(app)
                    .patch('/api/v1/admin/categories/category/5')
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(400);
                expect(res.body).toEqual({ message: "Category name is required and must be at least 2 characters long" });
            });

            it('PATCH /categories/category/:categoryId -> 200 when updated without parent category', async () => {
                pool.query
                    .mockResolvedValueOnce({ rows: [{ id: 5, name: 'OLD' }] }) // Existing category
                    .mockResolvedValueOnce({ rows: [] }); // No duplicate check

                const payload = { name: 'NEWNAME' };
                const res = await request(app)
                    .patch('/api/v1/admin/categories/category/5')
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(200);
                expect(res.body.category).toMatchObject({ id: 5, newName: 'NEWNAME' });

                // Adjust the expected call for the update query
                expect(pool.query).toHaveBeenNthCalledWith(1, expect.stringContaining('SELECT * FROM categories WHERE id = $1'), [5]);
                expect(pool.query).toHaveBeenNthCalledWith(2, expect.stringContaining('SELECT * FROM categories WHERE name ILIKE $1 AND id != $2'), ['NEWNAME', 5]);
                expect(pool.query).toHaveBeenNthCalledWith(3, expect.stringContaining('UPDATE categories SET name = $1 WHERE id = $3'), ['NEWNAME', 5]);
            });

            it('PATCH /categories/category/:categoryId -> 200 when updated with a parent category', async () => {
                pool.query
                    .mockResolvedValueOnce({ rows: [{ id: 10 }] })
                    .mockResolvedValueOnce({ rows: [{ id: 5, name: 'OLD' }]}) 
                    .mockResolvedValueOnce({ rows: [] });

                const payload = { name: 'NEWNAME', parent_id: 10 };
                const res = await request(app)
                    .patch(`/api/v1/admin/categories/category/5`)
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(200);
                expect(res.body.category).toMatchObject({ id: 5, newName: 'NEWNAME', newParentId: 10 });

                expect(pool.query).toHaveBeenNthCalledWith(1, expect.stringContaining('SELECT * FROM parent_categories WHERE id = $1'), [10]);
                expect(pool.query).toHaveBeenNthCalledWith(2, expect.stringContaining('SELECT * FROM categories WHERE id = $1'), [5]);
                expect(pool.query).toHaveBeenNthCalledWith(3, expect.stringContaining('SELECT * FROM categories WHERE name ILIKE $1 AND id != $2'), ['NEWNAME', 5]);
                expect(pool.query).toHaveBeenNthCalledWith(4, expect.stringContaining('UPDATE categories SET name = $1, parent_id = $2 WHERE id = $3'), ['NEWNAME', 10, 5]);
            });
        });

        describe('DELETE /categories/category/:categoryId (Delete category)', () => {
            it('DELETE /categories/category/:categoryId -> 404 when not found', async () => {
                pool.query.mockResolvedValueOnce({ rowCount: 0 }); 

                const res = await request(app)
                    .delete('/api/v1/admin/categories/category/99')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(404);
                expect(res.body).toEqual({ message: 'Category not found' });
            });

            it('DELETE /categories/category/:categoryId -> 400 when category has subcategories', async () => {
                pool.query
                    .mockResolvedValueOnce({ rows: [{ id: 5, name: 'OLD_CATEGORY' }] }) // Existing category
                    .mockResolvedValueOnce({ rows: [{ id: 6 }] }); // Simulate existing subcategories

                const res = await request(app)
                    .delete('/api/v1/admin/categories/category/5')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(400);
                expect(res.body).toEqual({ message: "Cannot delete category with subcategories" });
            });

            it('DELETE /categories/category/:categoryId -> 200 when deleted successfully', async () => {
                pool.query
                    .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // Existing category
                    .mockResolvedValueOnce({ rows: [] }); // No subcategories

                const res = await request(app)
                    .delete('/api/v1/admin/categories/category/5')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(200);
                expect(res.body).toEqual({ message: 'Category deleted successfully' });
                expect(pool.query).toHaveBeenCalledWith('DELETE FROM categories WHERE id = $1', [5]);
            });
        });
    });

    describe('User following related routes', () => {
        describe('GET /user-following/followers/:userId (Get followers of a user)', () => {
            it('GET /user-following/followers/:userId -> 404 when user not found', async () => {
                pool.query.mockResolvedValueOnce({ rowCount: 0 }); // Mock user not found

                const res = await request(app)
                    .get('/api/v1/admin/user-following/followers/999')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(404);
                expect(res.body).toEqual({ message: 'User not found' });
            });

            it('GET /user-following/followers/:userId -> 200 returns followers', async () => {
                const dbRows = [{
                    id: 21,
                    username: "user2",
                    first_name: "User",
                    last_name: "Two",
                    profile_image: null
                }, {
                    id: 22,
                    username: "user3",
                    first_name: "User",
                    last_name: "Three",
                    profile_image: null
                }]

                pool.query
                    .mockResolvedValueOnce({ rowCount: 1 })
                    .mockResolvedValueOnce({ rows: dbRows });

                const res = await request(app)
                    .get('/api/v1/admin/user-following/followers/1')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(200);
                expect(res.body).toEqual({
                    userFollowersCount: 2,
                    userFollowerList: [{
                        id: 21,
                        username: "user2",
                        first_name: "User",
                        last_name: "Two",
                        profile_image: null
                    }, {
                        id: 22,
                        username: "user3",
                        first_name: "User",
                        last_name: "Three",
                        profile_image: null
                    }]
                });
                expect(res.body.userFollowersCount).toBe(2);
                expect(res.body.userFollowerList).toEqual(dbRows);
                expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT * FROM users WHERE id = $1', [1]);
                expect(pool.query).toHaveBeenNthCalledWith(2, expect.stringContaining('JOIN user_following'), [1]);
            });
        });
    });

    describe('User Blocked related routes', () => {

    });

    describe('Reports related routes', () => {

    });

    describe('Browsing History related routes', () => {

    });

    describe('Bookmarks related routes', () => {

    });

    describe('Tags and Post Tags related routes', () => {

    });
});