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
                    .mockResolvedValueOnce({ rows: [{ id: 5, name: 'OLD' }] })
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
                pool.query.mockResolvedValueOnce({ rowCount: 0 });

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
        describe('GET /user-blocked/all-blocked-relationships (Get all user blocking relations)', () => {
            it('GET /user-blocked/all-blocked-relationships -> 200 returns all blocked relationships', async () => {
                const dbRows = [
                    {
                        blocker_id: 5,
                        blocked_id: 4,
                        blocker_username: "user3",
                        blocked_username: "user2",
                    },
                    {
                        blocker_id: 5,
                        blocked_id: 1,
                        blocker_username: "user3",
                        blocked_username: "admin1",
                    }
                ];

                pool.query.mockResolvedValueOnce({ rows: dbRows });

                const res = await request(app)
                    .get('/api/v1/admin/user-blocked/all-blocked-relationships')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(200);
                expect(res.body).toEqual(expect.objectContaining({
                    message: "Blocked users list fetched successfully",
                    blockedUsers: expect.arrayContaining([
                        expect.objectContaining({
                            blocker_id: 5,
                            blocked_id: 4,
                            blocker_username: "user3",
                            blocked_username: "user2",
                            relations: "user3 blocked user2"
                        }),
                        expect.objectContaining({
                            blocker_id: 5,
                            blocked_id: 1,
                            blocker_username: "user3",
                            blocked_username: "admin1",
                            relations: "user3 blocked admin1"
                        })
                    ])
                }));
                expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT user_blocked.blocker_id, user_blocked.blocked_id'));
            });
        });

        describe('POST /user-blocked/help-blocking (Help blocking user)', () => {
            it('POST /user-blocked/help-blocking -> 400 blocking already exists', async () => {
                const payload = { blockerId: 5, blockedId: 4, block_reason: "Spamming" };
                pool.query.mockResolvedValueOnce({ rows: [{ blocker_id: 5, blocked_id: 4 }] });

                const res = await request(app)
                    .post('/api/v1/admin/user-blocked/help-blocking')
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(400);
                expect(pool.query).toHaveBeenCalledWith(
                    'SELECT * FROM user_blocked WHERE blocker_id = $1 AND blocked_id = $2',
                    [5, 4]
                );
                expect(res.body).toEqual({ message: 'Block relationship already exists.' });
            });

            it('POST /user-blocked/help-blocking -> 200 creates blocking relationship', async () => {
                const payload = { blockerId: 5, blockedId: 4, block_reason: "Spamming" };
                pool.query
                    .mockResolvedValueOnce({ rowCount: 0 })
                    .mockResolvedValueOnce({});

                const res = await request(app)
                    .post('/api/v1/admin/user-blocked/help-blocking')
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(200);
                expect(pool.query).toHaveBeenNthCalledWith(1,
                    'SELECT * FROM user_blocked WHERE blocker_id = $1 AND blocked_id = $2',
                    [5, 4]
                );
                expect(pool.query).toHaveBeenNthCalledWith(2,
                    'INSERT INTO user_blocked (blocker_id, blocked_id, block_reason) VALUES ($1, $2, $3)',
                    [5, 4, 'Spamming']
                );
                expect(res.body).toEqual({ message: 'User blocked successfully.' });
            });
        });

        describe('DELETE /user-blocked/help-unblocking (Remove blocking relationship)', () => {
            it('DELETE /user-blocked/help-unblocking -> 404 when blocking relationship not found', async () => {
                const payload = { blockerId: 5, blockedId: 4 };
                pool.query.mockResolvedValueOnce({ rowCount: 0 });
                const res = await request(app)
                    .delete('/api/v1/admin/user-blocked/help-unblocking')
                    .set('x-test-user', 'test-user')
                    .send(payload);
                expect(res.status).toBe(404);
                expect(res.body).toEqual({ message: 'No blocked relationship found.' });
            });

            it('DELETE /user-blocked/help-unblocking -> 200 removes blocking relationship', async () => {
                const payload = { blockerId: 5, blockedId: 4 };
                pool.query.mockResolvedValueOnce({ rowCount: 1 });

                const res = await request(app)
                    .delete('/api/v1/admin/user-blocked/help-unblocking')
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(200);
                expect(res.body).toEqual({ message: "User unblocked successfully." });
                expect(pool.query).toHaveBeenCalledWith(
                    "DELETE FROM user_blocked WHERE blocker_id = $1 AND blocked_id = $2",
                    [5, 4]
                );
            });
        });
    });

    describe('Reports related routes', () => {
        describe('GET /reports/all-reports (View all reports)', () => {
            it('GET /reports/all-reports -> 200 retrieves all reports successfully', async () => {
                const reports = [
                    {
                        id: 3,
                        user_id: 5,
                        content_id: 1,
                        content_type: "post",
                        reason: "other",
                        custom_reason: "spam",
                        additional_comments: "This post is inappropriate.",
                        created_at: new Date().toISOString(),
                        status: "pending"
                    },
                    {
                        id: 2,
                        user_id: 3,
                        content_id: 1,
                        content_type: "post",
                        reason: "other",
                        custom_reason: "This is not good, I just don't like it",
                        additional_comments: "This post is inappropriate.",
                        created_at: new Date().toISOString(),
                        status: "pending"
                    },
                ];

                pool.query.mockResolvedValueOnce({ rows: reports });

                const res = await request(app)
                    .get('/api/v1/admin/reports/all-reports')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(200);
                expect(res.body).toEqual({
                    message: "Reports retrieved successfully.",
                    reports: reports,
                });
            });
        });

        describe('PATCH /reports/report/:reportId (Resolve a report)', () => {
            it('PATCH /reports/report/:reportId -> 200 resolves report successfully', async () => {
                const reportId = 1;
                const mockReport = { id: reportId, user_id: 10 };

                pool.query
                    .mockResolvedValueOnce({ rowCount: 1, rows: [mockReport] })
                    .mockResolvedValueOnce({ rows: [{ username: 'adminUser' }] });

                const res = await request(app)
                    .patch(`/api/v1/admin/reports/report/${reportId}`)
                    .set('x-test-user', 'test-user')
                    .send({ status: "resolved" });

                expect(res.status).toBe(200);
                expect(res.body).toEqual({
                    message: "Report resolved successfully.",
                    report: mockReport,
                });
                expect(createNotification).toHaveBeenCalledWith(
                    10,
                    expect.stringContaining("has been resolved by admin"),
                    'report_resolved',
                    reportId
                );
            });

            it('PATCH /reports/report/:reportId -> 404 when report not found', async () => {
                const reportId = 1;
                const payload = { status: "resolved" };

                pool.query.mockResolvedValueOnce({ rowCount: 0 });
                const res = await request(app)
                    .patch(`/api/v1/admin/reports/report/${reportId}`)
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(404);
                expect(res.body).toEqual({ message: "Report not found." });
            });
        });
    });

    describe('Browsing History related routes', () => {
        describe('GET /browsing-history/all-users-browsing-history (View all user browisng history)', () => {
            it('GET /browsing-history/all-users-browsing-history -> 200 retrieves all browsing history', async () => {
                const dbRows = [
                    {
                        "id": 1,
                        "user_id": 5,
                        "post_id": 1,
                        "visited_at": new Date().toISOString()
                    },
                    {
                        "id": 2,
                        "user_id": 6,
                        "post_id": 2,
                        "visited_at": new Date().toISOString()
                    }
                ];

                pool.query.mockResolvedValueOnce({
                    rows: dbRows
                });

                const res = await request(app)
                    .get('/api/v1/admin/browsing-history/all-users-browsing-history')
                    .set('x-test-user', 'test-user');
                expect(res.status).toBe(200);
                expect(res.body).toEqual(dbRows);
                expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM browsing_history ORDER BY visited_at DESC'));
            });
        });

        describe('GET /browsing-history/user-browsing-history/:userId (View user browsing history)', () => {
            it('GET /browsing-history/user-browsing-history/:userId -> 404 when user not found', async () => {
                pool.query.mockResolvedValueOnce({ rowCount: 0 });
                const res = await request(app)
                    .get('/api/v1/admin/browsing-history/user-browsing-history/999')
                    .set('x-test-user', 'test-user');
                expect(res.status).toBe(404);
                expect(res.body).toEqual({ message: 'User not found' });
            });

            it('GET /browsing-history/user-browsing-history/:userId -> 200 retrieves user browsing history', async () => {
                const dbRows = [
                    {
                        "id": 1,
                        "user_id": 5,
                        "post_id": 1,
                        "visited_at": new Date().toISOString()
                    },
                    {
                        "id": 1,
                        "user_id": 5,
                        "post_id": 2,
                        "visited_at": new Date().toISOString()
                    }
                ];

                pool.query
                    .mockResolvedValueOnce({ rowCount: 1 })
                    .mockResolvedValueOnce({ rows: dbRows });

                const res = await request(app)
                    .get('/api/v1/admin/browsing-history/user-browsing-history/5')
                    .set('x-test-user', 'test-user');
                expect(res.status).toBe(200);
                expect(res.body).toEqual(dbRows);
                expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT * FROM users WHERE id = $1', [5]);
                expect(pool.query).toHaveBeenNthCalledWith(2, expect.stringContaining('SELECT * FROM browsing_history WHERE user_id = $1 ORDER BY visited_at DESC'), [5]);
            });
        });

        describe('DELETE /browsing-history/user-browsing-history/:userId (Delete user browsing histories)', () => {
            it('DELETE /browsing-history/user-browsing-history/:userId -> 404 when user not found', async () => {
                pool.query.mockResolvedValueOnce({ rowCount: 0 });
                const res = await request(app)
                    .delete('/api/v1/admin/browsing-history/user-browsing-history/999')
                    .set('x-test-user', 'test-user')
                    .send({ postIds: [1, 2] });
                expect(res.status).toBe(404);
                expect(res.body).toEqual({ message: 'User not found' });
            });

            it('DELETE /browsing-history/user-browsing-history/:userId -> 200 deletes specified browsing history', async () => {
                pool.query
                    .mockResolvedValueOnce({ rowCount: 1 })
                    .mockResolvedValueOnce({ rowCount: 2 });

                const res = await request(app)
                    .delete('/api/v1/admin/browsing-history/user-browsing-history/5')
                    .set('x-test-user', 'test-user')
                    .send({ postIds: [1, 2] });
                expect(res.status).toBe(200);
                expect(res.body).toEqual({ message: 'Browsing history deleted for user ID 5', deletedCount: 2 });
                expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT * FROM users WHERE id = $1', [5]);
                expect(pool.query).toHaveBeenNthCalledWith(2, 'DELETE FROM browsing_history WHERE user_id = $1 AND post_id = ANY($2::int[])', [5, [1, 2]]);
            });
        });

        describe('DELETE /browsing-history/:historyId (Delete single browisng history)', () => {
            it('DELETE /browsing-history/:historyId -> 404 when browsing history not found', async () => {
                pool.query.mockResolvedValueOnce({ rowCount: 0 });
                const res = await request(app)
                    .delete('/api/v1/admin/browsing-history/999')
                    .set('x-test-user', 'test-user');
                expect(res.status).toBe(404);
                expect(res.body).toEqual({ message: 'Browsing entry not found.' });
            });

            it('DELETE /browsing-history/:historyId -> 200 deletes browsing history successfully', async () => {
                pool.query
                    .mockResolvedValueOnce({ rowCount: 1 })
                    .mockResolvedValueOnce({ rowCount: 2 });

                const res = await request(app)
                    .delete('/api/v1/admin/browsing-history/1')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(200);
                expect(res.body).toEqual({ message: 'Browsing entry deleted successfully.' });
                expect(pool.query).toHaveBeenNthCalledWith(1, 'SELECT * FROM browsing_history WHERE id = $1', [1]);
                expect(pool.query).toHaveBeenNthCalledWith(2, 'DELETE FROM browsing_history WHERE id = $1', [1]);
            });
        })

        describe('GET /browsing-history/analytics (Get browsing history analytics)', () => {
            it('should return browsing analytics successfully', async () => {
                const dbRows = {
                    mostVisitedPosts: [
                        { post_id: 1, visit_count: 12, unique_users: 3 },
                        { post_id: 3, visit_count: 11, unique_users: 2 },
                        { post_id: 2, visit_count: 6, unique_users: 1 },
                    ],
                    dailyVisits: [
                        { post_id: 1, visit_date: '2025-10-29T16:00:00.000Z', visits: 1 },
                        { post_id: 3, visit_date: '2025-10-10T16:00:00.000Z', visits: 11 },
                        { post_id: 1, visit_date: '2025-10-10T16:00:00.000Z', visits: 11 },
                        { post_id: 2, visit_date: '2025-10-10T16:00:00.000Z', visits: 6 },
                    ],
                    userVisitPatterns: [
                        { user_id: 4, posts_visited: 3 },
                        { user_id: 3, posts_visited: 2 },
                        { user_id: 5, posts_visited: 1 },
                    ],
                };

                pool.query
                    .mockResolvedValueOnce({ rows: dbRows.mostVisitedPosts })
                    .mockResolvedValueOnce({ rows: dbRows.dailyVisits })
                    .mockResolvedValueOnce({ rows: dbRows.userVisitPatterns });


                const res = await request(app)
                    .get('/api/v1/admin/browsing-history/analytics')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(200);
                expect(res.body).toEqual({
                    most_visited_posts: dbRows.mostVisitedPosts,
                    daily_visits: dbRows.dailyVisits,
                    user_visit_patterns: dbRows.userVisitPatterns,
                });
                expect(pool.query).toHaveBeenNthCalledWith(1, expect.stringContaining('SELECT post_id, COUNT(*) AS visit_count, COUNT(DISTINCT user_id) AS unique_users'));
                expect(pool.query).toHaveBeenNthCalledWith(2, expect.stringContaining('SELECT post_id, DATE(visited_at) AS visit_date, COUNT(*) AS visits'));
                expect(pool.query).toHaveBeenNthCalledWith(3, expect.stringContaining('SELECT user_id, COUNT(DISTINCT post_id) AS posts_visited'));
            });
        });

        describe('GET /browsing-history/summary (Get browsing history summary)', () => {
            it('should return browsing history summary successfully', async () => {
                pool.query
                    .mockResolvedValueOnce({ rows: [{ total_visits: 100 }] })
                    .mockResolvedValueOnce({ rows: [{ unique_users: 50 }] })
                    .mockResolvedValueOnce({ rows: [{ average_visits_per_post: 10 }] });

                const res = await request(app)
                    .get('/api/v1/admin/browsing-history/summary')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(200);
                expect(res.body).toEqual({
                    total_visits: 100,
                    unique_users: 50,
                    average_visits_per_post: 10,
                });
            });
        });
    });

    describe('Bookmarks related routes', () => {
        describe('GET /bookmarks/all-users-bookmarks (View all user bookmarks)', () => {
            it('GET /bookmarks/all-users-bookmarks -> 200 retrieves all user bookmarks', async () => {
                const dbRows = [
                    {
                        "bookmark_id": 1,
                        "user_id": 5,
                        "user_name": "user3",
                        "post_id": 3,
                        "post_title": "Third Post Ever",
                        "upvotes": 0,
                        "downvotes": "0",
                        "category_name": "CREATIVITY",
                        "post_created_at": new Date().toISOString()
                    },
                    {
                        "bookmark_id": 2,
                        "user_id": 6,
                        "user_name": "user4",
                        "post_id": 4,
                        "post_title": "Fourth Post Ever",
                        "upvotes": 5,
                        "downvotes": "1",
                        "category_name": "TECHNOLOGY",
                        "post_created_at": new Date().toISOString()
                    }
                ];
                pool.query.mockResolvedValueOnce({ rows: dbRows });

                const res = await request(app)
                    .get('/api/v1/admin/bookmarks/all-users-bookmarks')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(200);
                expect(res.body).toEqual(dbRows);
                expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT b.id AS bookmark_id'));
            });
        });

        describe('GET /bookmarks/statistics (Get bookmarks statistics)', () => {
            it('GET /bookmarks/statistics -> 200 return bookmark statistics successfully', async () => {
                pool.query
                    .mockResolvedValueOnce({ rows: [{ count: 2 }] })
                    .mockResolvedValueOnce({ rows: [{ user_id: 5, total: 2 }] })

                const res = await request(app)
                    .get('/api/v1/admin/bookmarks/statistics')
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(200);
                expect(res.body).toEqual({
                    totalBookmarks: 2,
                    bookmarksPerUser: [
                        {
                            user_id: 5,
                            total: 2,
                        },
                    ],
                });
            });
        });

        describe('DELETE /bookmarks/user-bookmarks/:userId (Delete user bookmarks)', () => {
            it('DELETE /bookmarks/user-bookmarks/:userId -> delete a user bookmark successfully', async () => {
                const bookmarkId = 1;

                pool.query.mockResolvedValueOnce({ rowCount: 1 });

                const res = await request(app)
                    .delete(`/api/v1/admin/bookmarks/bookmark/${bookmarkId}`)
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(200);
                expect(res.body).toEqual({ message: `Bookmark ${bookmarkId} removed successfully.` });
                expect(pool.query).toHaveBeenCalledWith('DELETE FROM bookmarks WHERE id = $1', [bookmarkId]);
            });

            it('should return 404 error when bookmark does not exist', async () => {
                const bookmarkId = 2;

                pool.query.mockResolvedValueOnce({ rowCount: 0 });

                const res = await request(app)
                    .delete(`/api/v1/admin/bookmarks/bookmark/${bookmarkId}`)
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(404);
                expect(res.body).toEqual({ message: "Bookmark not found." });
            });

            it('should return 400 error when bookmark ID is not valid', async () => {
                const res = await request(app)
                    .delete(`/api/v1/admin/bookmarks/bookmark/invalidId`)
                    .set('x-test-user', 'test-user');

                expect(res.status).toBe(400);
                expect(res.body).toEqual({ message: "Bookmark ID is required." });
            });
        });
    });

    describe('Tags and Post Tags related routes', () => {
        describe('POST /tags/new-tag (Create new tag)', () => {
            it('POST /tags/new-tag -> 400 when tag name is missing', async () => {
                const payload = {};
                const res = await request(app)
                    .post('/api/v1/admin/tags/new-tag')
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(400);
                expect(res.body).toEqual({ message: "Tag name is required." });
            })

            it('POST /tags/new-tag -> 409 error when a similar tag already exists', async () => {
                const payload = { name: "ExistingTag" };

                pool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: "ExistingTag" }] });

                const res = await request(app)
                    .post('/api/v1/admin/tags/new-tag')
                    .set('x-test-user', 'test-user')
                    .send(payload)

                expect(res.status).toBe(409);
                expect(res.body).toEqual({ message: "Similar tags already exists" });
            });

            it('POST /tags/new-tag -> 200 creates tag successfully', async () => {
                const payload = { name: "NewTag" };

                // Mock the database responses
                pool.query
                    .mockResolvedValueOnce({ rows: [] }) // No similar tags
                    .mockResolvedValueOnce({ rows: [{ id: 10, name: "NewTag" }] }); // Tag creation

                const res = await request(app)
                    .post('/api/v1/admin/tags/new-tag')
                    .set('x-test-user', 'test-user')
                    .send(payload)
                    .set('Authorization', `Bearer some-token`); // Assuming you have some auth middleware

                expect(res.status).toBe(200);
                expect(res.body).toEqual({
                    message: "Tag created successfully.",
                    tag: { id: 10, name: "NewTag" }
                });
                expect(pool.query).toHaveBeenNthCalledWith(1, expect.stringContaining('SELECT * FROM tags WHERE name ILIKE $1'), [payload.name]);
                expect(pool.query).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO tags (name, approved, user_id) VALUES ($1, TRUE, $2) RETURNING *'), [payload.name, 99]);
            });
        });

        describe('POST /tags/link-tag-to-post (Link tag to post)', () => {
            it('POST /tags/link-tag-to-post -> 400 when post ID and tag ID are missing', async () => {
                const payload = {};
                const res = await request(app)
                    .post('/api/v1/admin/tags/link-tag-to-post')
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(400);
                expect(res.body).toEqual({ message: "Post ID and Tag ID are required." });
            });

            it('POST /tags/link-tag-to-post -> 404 when tag not found or not approved', async () => {
                const payload = { postId: 1, tagId: 99 };
                pool.query.mockResolvedValueOnce({ rowCount: 0 });

                const res = await request(app)
                    .post('/api/v1/admin/tags/link-tag-to-post')
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(404);
                expect(res.body).toEqual({ message: "Tag not found or not approved." });
            });

            it('POST /tags/link-tag-to-post -> 200 linked tag to post successfully', async () => {
                const payload = { postId: 1, tagId: 99 };

                pool.query.mockResolvedValueOnce({ rowCount: 1 });
                pool.query.mockResolvedValueOnce({});

                const res = await request(app)
                    .post('/api/v1/admin/tags/link-tag-to-post')
                    .set('x-test-user', 'test-user')
                    .send(payload);

                expect(res.status).toBe(200);
                expect(res.body).toEqual({ message: "Tag linked to post successfully." });

                expect(pool.query).toHaveBeenNthCalledWith(1, expect.stringContaining('SELECT * FROM tags WHERE id = $1 AND approved = TRUE'), [payload.tagId]);
                expect(pool.query).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2)'), [payload.postId, payload.tagId]);
            });
        });

        describe('PATCH /tags/tag/:tagId (Approve tag)', () => {
            it('PATCH /tags/tag/:tagId -> 400 when tag ID is missing', async () => {
                const res = await request(app)
                    .patch('/api/v1/admin/tags/tag/:tagId')
                    .set('x-test-user', 'test-user')
                    .send();

                expect(res.status).toBe(400);
                expect(res.body).toEqual({ message: "Tag ID is required." });
            });

            it('PATCH /tags/tag/:tagId -> 404 when tag not found', async () => {
                const tagId = 99;
                pool.query.mockResolvedValueOnce({ rowCount: 0 });

                const res = await request(app)
                    .patch(`/api/v1/admin/tags/tag/${tagId}`)
                    .set('x-test-user', 'test-user')
                    .send();

                expect(res.status).toBe(404);
                expect(res.body).toEqual({ message: "Tag not found." });
            });

            it('PATCH /tags/tag/:tagId -> 200 Tag approved and linked to posts successfully', async () => {
                const tagId = 1;
                const tagName = "NewTag";
                const tagCreatorId = 2;
                const adminUsername = "admin_user";

                // Mock responses
                pool.query
                    .mockResolvedValueOnce({ rows: [{ name: tagName, user_id: tagCreatorId }], rowCount: 1 })
                    .mockResolvedValueOnce({ rows: [{ username: adminUsername }] })
                    .mockResolvedValueOnce({ rows: [] });

                const res = await request(app)
                    .patch(`/api/v1/admin/tags/tag/${tagId}`)
                    .set('x-test-user', 'test-user')
                    .send();

                expect(res.status).toBe(200);
                expect(res.body).toEqual({ message: "Tag approved and linked to posts successfully." });
                expect(createNotif).toHaveBeenCalledWith(tagCreatorId, `Your tag "${tagName}" has been approved by admin ${adminUsername}. Everyone can use the tag you created while posting now!`, 'tag_approved', tagId);
                expect(pool.query).toHaveBeenNthCalledWith(1, expect.stringContaining('UPDATE tags SET approved = TRUE WHERE id = $1 RETURNING *'), [tagId]);
                expect(pool.query).toHaveBeenNthCalledWith(2, expect.stringContaining('SELECT username FROM users WHERE id = $1'), [99]);
            });
        });

        describe('DELETE /tags/tag/:tagId (Delete tag)', () => {
            it('DELETE /tags/tag/:tagId -> 400 when tag ID is missing', async () => {
                const res = await request(app)
                    .delete('/api/v1/admin/tags/tag/:tagId')
                    .set('x-test-user', 'test-user')
                    .send();

                expect(res.status).toBe(400);
                expect(res.body).toEqual({ message: "Tag ID is required." });
            });

            it('DELETE /tags/tag/:tagId -> 404 when tag not found', async () => {
                const tagId = 99;
                pool.query.mockResolvedValueOnce({ rowCount: 0 });

                const res = await request(app)
                    .delete(`/api/v1/admin/tags/tag/${tagId}`)
                    .set('x-test-user', 'test-user')
                    .send();

                expect(res.status).toBe(404);
                expect(res.body).toEqual({ message: "Tag not found." });
            });

            it('DELETE /tags/tag/:tagId -> 200 tag removed successfully', async () => {
                const tagId = 1;
                const tagName = "OldTag";
                const tagCreatorId = 2;
                const adminUsername = "admin_user";
                const adminId = 999;

                pool.query
                    .mockResolvedValueOnce({ rows: [{ id: adminId, username: adminUsername }] })
                    .mockResolvedValueOnce({ rows: [{ name: tagName, user_id: tagCreatorId }], rowCount: 1 })
                    .mockResolvedValueOnce({ rows: [{ username: adminUsername }] })
                    .mockResolvedValueOnce({ rows: [], rowCount: 1 });

                const res = await request(app)
                    .delete(`/api/v1/admin/tags/tag/${tagId}`)
                    .set('x-test-user', 'test-user')
                    .send();

                expect(res.status).toBe(200);
                expect(res.body).toEqual({ message: `Tag ${tagId} removed successfully.` });
            });
        });
    });
});
