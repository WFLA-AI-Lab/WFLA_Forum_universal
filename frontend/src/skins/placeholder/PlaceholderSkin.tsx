import './placeholder.css';
import type { SkinContext } from '../contract';

/**
 * Temporary shell shown while the production UI is being rebuilt.
 * It intentionally renders no fake forum data and performs no requests.
 */
export default function PlaceholderSkin({ forum }: { forum: SkinContext }) {
  const user = forum.session.me;

  return (
    <main className="placeholder-skin">
      <section aria-labelledby="placeholder-title">
        <p className="placeholder-eyebrow">{forum.site.forum_name}</p>
        <h1 id="placeholder-title">前端界面正在重做</h1>
        <p>
          旧的两套展示皮肤已移除。后端、账号与管理后台仍在运行；新的论坛界面完成后会在这里展示。
        </p>
        <div className="placeholder-actions">
          {forum.session.isAdmin && (
            <a href="/admin">打开管理后台</a>
          )}
          {user ? (
            <span>
              已登录：{user.real_name}
            </span>
          ) : (
            <span>访客模式</span>
          )}
        </div>
      </section>
    </main>
  );
}
