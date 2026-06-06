import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { generateToken } from '../utils/jwt';

export const login = async (req: Request, res: Response) => {
  try {
    const { nipp, password } = req.body;

    if (!nipp || !password) {
      return res.status(400).json({ success: false, message: 'NIPP and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { nipp },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = generateToken(user.id, user.role);

    return res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        nipp: user.nipp,
        nama: user.nama,
        role: user.role,
        foto: user.foto,
        jabatan: user.jabatan,
        division: user.division,
        workArea: user.workArea,
        phone: user.phone,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const register = async (req: Request, res: Response) => {
  try {
    const { nipp, password, nama, role, foto } = req.body;

    if (!nipp || !password || !nama) {
      return res.status(400).json({ success: false, message: 'NIPP, nama, and password are required' });
    }

    const existingUser = await prisma.user.findUnique({
      where: { nipp },
    });

    if (existingUser) {
      return res.status(400).json({ success: false, message: 'NIPP already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        nipp,
        nama,
        password: hashedPassword,
        role: role || 'ppj',
        foto: foto || null,
      },
    });

    const token = generateToken(user.id, user.role);

    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: {
        id: user.id,
        nipp: user.nipp,
        nama: user.nama,
        role: user.role,
        foto: user.foto,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    // req.user is set by the auth middleware
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nipp: true,
        nama: true,
        role: true,
        foto: true,
        jabatan: true,
        division: true,
        workArea: true,
        phone: true,
        isActive: true,
        wilayahAssignments: {
          include: { wilayah: true },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({ success: true, user });
  } catch (error) {
    console.error('Get Me error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const checkNipp = async (req: Request, res: Response) => {
  try {
    const { nipp } = req.params;
    if (!nipp) {
      return res.status(400).json({ success: false, message: 'NIPP is required' });
    }

    const user = await prisma.user.findUnique({
      where: { nipp },
      select: { nama: true, role: true }
    });

    if (user) {
      return res.json({ success: true, exists: true, user });
    } else {
      return res.json({ success: true, exists: false });
    }
  } catch (error) {
    console.error('Check NIPP error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const { nama, foto, phone, password } = req.body;

    // Build update data — only include fields that were provided
    const updateData: any = {};

    if (nama !== undefined) updateData.nama = nama;
    if (foto !== undefined) updateData.foto = foto;
    if (phone !== undefined) updateData.phone = phone;

    // Hash password if provided
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      }
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        nipp: true,
        nama: true,
        role: true,
        foto: true,
        jabatan: true,
        division: true,
        workArea: true,
        phone: true,
        isActive: true,
      },
    });

    return res.json({ success: true, message: 'Profile updated', user: updatedUser });
  } catch (error) {
    console.error('Update Profile error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
