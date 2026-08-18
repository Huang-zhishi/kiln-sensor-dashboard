import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const SYSTEMS_FILE = path.join(process.cwd(), 'public', 'process-systems.json');
// 与 systems/route.ts 的 IMPORTS_DIR 保持一致，确保删除时可找到文件
const IMPORTS_DIR = path.join(process.cwd(), 'public', 'imports');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB 上限

interface ProcessSystem {
  id: string;
  name: string;
  file: string;
  apiBaseUrl: string;
  createdAt: string;
}

// 后端文件校验：仅接受非空 .html/.htm，且大小不超过 10MB
function isValidHtmlFile(file: File): boolean {
  return /\.html?$/i.test(file.name) && file.size > 0 && file.size <= MAX_FILE_SIZE;
}

function loadSystems(): ProcessSystem[] {
  try {
    if (fs.existsSync(SYSTEMS_FILE)) {
      return JSON.parse(fs.readFileSync(SYSTEMS_FILE, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveSystems(systems: ProcessSystem[]) {
  fs.mkdirSync(path.dirname(SYSTEMS_FILE), { recursive: true });
  fs.writeFileSync(SYSTEMS_FILE, JSON.stringify(systems, null, 2), 'utf-8');
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const name = (formData.get('name') as string) || '';
    const apiBaseUrl = (formData.get('apiBaseUrl') as string) || '';

    if (!file) {
      return NextResponse.json({ success: false, error: '请上传 HTML 文件' }, { status: 400 });
    }

    if (!isValidHtmlFile(file)) {
      return NextResponse.json(
        { success: false, error: '仅支持非空 .html/.htm 文件，且大小不超过 10MB' },
        { status: 400 },
      );
    }

    if (!name) {
      return NextResponse.json({ success: false, error: '请输入系统名称' }, { status: 400 });
    }

    // 生成唯一 ID
    const systems = loadSystems();
    const id = String(Date.now());
    const filename = `${id}.html`;

    // 保存文件到 imports 目录（与删除逻辑目录一致）
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.mkdirSync(IMPORTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(IMPORTS_DIR, filename), buffer);

    // 注册系统
    const newSystem: ProcessSystem = {
      id,
      name,
      file: `/imports/${filename}`,
      apiBaseUrl: apiBaseUrl || '.',
      createdAt: new Date().toISOString(),
    };
    systems.push(newSystem);
    saveSystems(systems);

    return NextResponse.json({ success: true, data: newSystem });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/** 更新已有系统（可替换文件、修改名称/API 地址） */
export async function PUT(req: NextRequest) {
  try {
    const formData = await req.formData();
    const id = formData.get('id') as string;
    const file = formData.get('file') as File | null;
    const name = (formData.get('name') as string) || '';
    const apiBaseUrl = (formData.get('apiBaseUrl') as string) || '';

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少系统 ID' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ success: false, error: '请输入系统名称' }, { status: 400 });
    }

    const systems = loadSystems();
    const idx = systems.findIndex((s) => s.id === id);
    if (idx === -1) {
      return NextResponse.json({ success: false, error: '未找到该系统' }, { status: 404 });
    }

    // 如果上传了新文件，替换旧文件
    if (file) {
      if (!isValidHtmlFile(file)) {
        return NextResponse.json(
          { success: false, error: '仅支持非空 .html/.htm 文件，且大小不超过 10MB' },
          { status: 400 },
        );
      }
      const filename = `${id}.html`;
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.mkdirSync(IMPORTS_DIR, { recursive: true });
      fs.writeFileSync(path.join(IMPORTS_DIR, filename), buffer);
      systems[idx].file = `/imports/${filename}`;
    }

    // 更新元数据
    systems[idx].name = name;
    systems[idx].apiBaseUrl = apiBaseUrl || '.';
    saveSystems(systems);

    return NextResponse.json({ success: true, data: systems[idx] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}