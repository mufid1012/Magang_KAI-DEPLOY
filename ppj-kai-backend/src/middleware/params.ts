import type { Request, Response, NextFunction } from 'express';
export function validatePositiveParam(_req: Request, res: Response, next: NextFunction, value: string) {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value)>2147483647) {
    return res.status(400).json({success:false,message:'ID tidak valid'});
  }
  next();
}
