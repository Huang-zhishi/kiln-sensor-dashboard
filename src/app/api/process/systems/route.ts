import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const SYSTEMS_FILE = path.join(process.cwd(), 'public', 'process-systems.json');
const IMPORTS_DIR = path.join(process.cwd(), 'public', 'imports');

interface ProcessSystem {
  id: string;
  name: string;
  file: string;
  apiBaseUrl: string;
  createdAt: string;
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

export async function GET() {
  const systems = loadSystems();
  return NextResponse.json({ success: true, data: systems });
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    const systems = loadSystems();
    const idx = systems.findIndex((s) => s.id === id);
    if (idx === -1) {
      return NextResponse.json({ success: false, error: '未找到该系统' }, { status: 404 });
    }

    // 删除文件
    const filePath = path.join(IMPORTS_DIR, `${id}.html`);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {}

    // 移除注册
    systems.splice(idx, 1);
    saveSystems(systems);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}