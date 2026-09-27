import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// 与 api/process/upload、api/process/systems 保持一致的导入目录
const IMPORTS_DIR = path.join(process.cwd(), 'public', 'imports');

/**
 * 动态服务导入/修改后的工艺流程图 HTML。
 *
 * 为什么不能直接用 public/ 静态服务：
 * Next.js standalone 模式下，运行期写入 public/ 的新文件不会被静态文件服务
 * 识别（实测返回 404，只有构建期已存在的 public 文件才可访问）。
 * 因此这里用路由处理器按请求实时读取磁盘文件。
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 只允许 <数字>.html 形式的文件名，杜绝路径穿越
  const name = path.basename(id);
  if (!/^[0-9]+\.html?$/i.test(name)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const filePath = path.join(IMPORTS_DIR, name);
  if (!fs.existsSync(filePath)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const html = fs.readFileSync(filePath, 'utf-8');
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // 修改/重新导入后立即生效，避免浏览器缓存旧流程图
      'Cache-Control': 'no-store',
    },
  });
}
