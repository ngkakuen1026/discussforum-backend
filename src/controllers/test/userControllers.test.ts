jest.mock('../../db/db', () => ({ __esModule: true, default: { query: jest.fn() } }));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

// mock cloudinary db config
jest.mock('../../config/cloudinary', () => ({
    __esModule: true,
    default: { uploader: { upload: jest.fn(), destroy: jest.fn() } }
}));

jest.mock('../../utils/extractCloudinaryUrl', () => ({
    __esModule: true,
    extractPublicId: jest.fn(() => 'public-id')
}));

jest.mock('fs', () => ({
    unlinkSync: jest.fn(),
    existsSync: jest.fn(() => true)
}));

jest.mock('bcrypt', () => ({
    compare: jest.fn(),
    hash: jest.fn()
}));

jest.mock('../../middleware/auth', () => ({
    __esModule: true,
    isAuthenticated: (req: any, _res: any, next: any) => {
        const marker = req.headers['x-test-user'] || req.headers['authorization'];
        if (marker === 'test-user') {
            req.user = { id: 3 };
            return next();
        }
        return _res.status(401).json({ message: 'Unauthorized' });
    }
}));

import request from 'supertest';
import app from '../../app';
import poolDefault from '../../db/db';
import * as fs from 'fs';
import bcrypt from 'bcrypt';
import cloudinary from '../../config/cloudinary';
import { extractPublicId } from '../../utils/extractCloudinaryUrl';
import { uploadProfileImage, deleteProfileImage } from '../userControllers';

const pool = poolDefault as unknown as { query: jest.Mock };
const bCompare = bcrypt.compare as unknown as jest.Mock;
const bHash = bcrypt.hash as unknown as jest.Mock;
const cloudUpload = (cloudinary as any).uploader.upload as jest.Mock;
const cloudDestroy = (cloudinary as any).uploader.destroy as jest.Mock;
const fsUnlink = (fs as any).unlinkSync as jest.Mock;
const fsExists = (fs as any).existsSync as jest.Mock;
const extractPub = extractPublicId as jest.Mock;

describe('User controllers - integration tests (supertest) with mocked DB + direct controller tests', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('GET /api/v1/users/user-profile/:id (View specific user profile) -> 200 returns public profile without password', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 5, username: 'bob', password_hash: 'secret', email: 'b@x' }] });

        const res = await request(app).get('/api/v1/users/user-profile/5');

        expect(res.status).toBe(200);
        expect(res.body.users).toBeInstanceOf(Array);
        expect(res.body.users[0]).toMatchObject({ id: 5, username: 'bob', email: 'b@x' });
        expect(res.body.users[0].password_hash).toBeUndefined();
        expect(pool.query).toHaveBeenCalledWith("SELECT * FROM users WHERE id = $1", [5]);
    });

    it('GET /api/v1/users/user-profile/:id (View specific user profile) -> 404 when not found', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(app).get('/api/v1/users/user-profile/99');

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ message: 'User not found' });
    });

    it('GET /api/v1/users/profile/me (View own profile) -> 200 returns safe user for authenticated', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 3, username: 'me', email: 'me@x', password_hash: 'h' }] });

        const res = await request(app).get('/api/v1/users/profile/me').set('x-test-user', 'test-user');

        expect(res.status).toBe(200);
        expect(res.body.user).toMatchObject({ id: 3, username: 'me', email: 'me@x' });
        expect(res.body.user.password_hash).toBeUndefined();
        expect(pool.query).toHaveBeenCalledWith("SELECT * FROM users WHERE id = $1", [3]);
    });

    it('PATCH /api/v1/users/profile/me (Update own profile) -> 200 updates profile', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 3, username: 'old', email: 'old@x', first_name: 'A', last_name: 'B', phone: '', gender: '', bio: '' }] }) // select
            .mockResolvedValueOnce({ rows: [{ id: 3, username: 'new', email: 'new@x' }] }); // update

        const res = await request(app)
            .patch('/api/v1/users/profile/me')
            .set('x-test-user', 'test-user')
            .send({ username: 'new', email: 'new@x' });

        expect(res.status).toBe(200);
        expect(res.body.user).toMatchObject({ id: 3, username: 'new', email: 'new@x' });
        expect(pool.query).toHaveBeenCalledTimes(2);
    });

    it('PATCH /api/v1/users/profile/password (Update own password) -> 404 when user not found', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(app)
            .patch('/api/v1/users/profile/password')
            .set('x-test-user', 'test-user')
            .send({ oldPassword: 'a', newPassword: 'b' });

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ message: 'User not found' });
    });

    it('PATCH /api/v1/users/profile/password (Update own password) -> 400 when old password wrong', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 3, password_hash: 'hash' }] });
        bCompare.mockResolvedValueOnce(false);

        const res = await request(app)
            .patch('/api/v1/users/profile/password')
            .set('x-test-user', 'test-user')
            .send({ oldPassword: 'bad', newPassword: 'new' });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ message: 'Old password is incorrect' });
        expect(bCompare).toHaveBeenCalledWith('bad', 'hash');
    });

    it('PATCH /api/v1/users/profile/password (Update own password) -> 200 when password updated', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 3, password_hash: 'hash' }] }) // select
            .mockResolvedValueOnce({}); // update

        bCompare.mockResolvedValueOnce(true);
        bHash.mockResolvedValueOnce('new-hash');

        const res = await request(app)
            .patch('/api/v1/users/profile/password')
            .set('x-test-user', 'test-user')
            .send({ oldPassword: 'good', newPassword: 'new' });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ message: 'Password updated successfully' });
        expect(pool.query).toHaveBeenCalledWith("UPDATE users SET password_hash = $1 WHERE id = $2", ['new-hash', 3]);
    });

    it('uploadProfileImage -> 400 when no file uploaded', async () => {
        const req: any = { user: { id: 3 }, file: undefined };
        const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        await uploadProfileImage(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ message: 'No file uploaded' });
    });

    it('uploadProfileImage -> 404 when user not found and unlinks file', async () => {
        const req: any = { user: { id: 3 }, file: { path: 'tmp/path' } };
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        await uploadProfileImage(req, res);

        expect(fsUnlink).toHaveBeenCalledWith('tmp/path');
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ message: 'User not found' });
    });

    it('uploadProfileImage -> 200 uploads, destroys old image and updates user', async () => {
        const req: any = { user: { id: 3 }, file: { path: 'tmp/path' } };

        const currentUser = { id: 3, profile_image: 'https://res.cloudinary.com/demo/image/upload/v123/old.jpg' };
        pool.query
            .mockResolvedValueOnce({ rows: [currentUser] }) // select user
            .mockResolvedValueOnce({ rows: [{ id: 3, profile_image: 'https://res.cloudinary.com/demo/image/upload/v123/new.jpg' }] });

        extractPub.mockReturnValueOnce('old-public-id');
        cloudUpload.mockResolvedValueOnce({ secure_url: 'https://res.cloudinary.com/demo/image/upload/v123/new.jpg' });
        cloudDestroy.mockResolvedValueOnce({});
        fsUnlink.mockImplementationOnce(() => { /* noop */ });

        const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        await uploadProfileImage(req, res);

        expect(cloudUpload).toHaveBeenCalledWith('tmp/path', expect.any(Object));
        expect(cloudDestroy).toHaveBeenCalledWith('old-public-id');
        expect(fsUnlink).toHaveBeenCalledWith('tmp/path');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Image uploaded and user updated successfully', user: expect.any(Object) }));
    });

    it('deleteProfileImage -> 403 when user not found', async () => {
        const req: any = { user: { id: 3 } };
        const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        pool.query.mockResolvedValueOnce({ rows: [] }); // user not found

        await deleteProfileImage(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized to delete image for this user' });
    });

    it('deleteProfileImage -> 200 deletes image, destroys cloudinary and clears db', async () => {
        const req: any = { user: { id: 3 } };
        const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 3 }] }) // SELECT * FROM users
            .mockResolvedValueOnce({ rows: [{ profile_image: 'https://res.cloudinary.com/demo/image/upload/v123/old.jpg' }] }) // SELECT profile_image
            .mockResolvedValueOnce({}); // UPDATE set NULL

        extractPub.mockReturnValueOnce('old-public-id');
        cloudDestroy.mockResolvedValueOnce({});
        await deleteProfileImage(req, res);

        expect(cloudDestroy).toHaveBeenCalledWith('old-public-id');
        expect(pool.query).toHaveBeenCalledWith("UPDATE users SET profile_image = NULL WHERE id = $1", [3]);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: 'Image deleted successfully' });
    });

    it('DELETE /api/v1/users/profile/:id (Delete own account) -> 404 when no user deleted', async () => {
        pool.query.mockResolvedValueOnce({ rowCount: 0 });

        const res = await request(app).delete('/api/v1/users/profile/3').set('x-test-user', 'test-user');

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ message: 'User not found' });
    });

    it('DELETE /api/v1/users/profile/:id (Delete own account) -> 200 when account deleted', async () => {
        pool.query.mockResolvedValueOnce({ rowCount: 1 });

        const res = await request(app).delete('/api/v1/users/profile/3').set('x-test-user', 'test-user');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ message: 'User account deleted successfully' });
    });
});