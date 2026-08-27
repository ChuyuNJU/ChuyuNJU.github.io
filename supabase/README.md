# Achievements 的 Supabase 配置

GitHub Pages 前端已经完成，但必须连接一个 Supabase 项目后才能加载和管理
成果资料。以下步骤均不需要把任何私密密钥写入仓库。

## 1. 创建并初始化项目

1. 创建 Supabase 项目，选择距离主要使用地点较近的可用区域。
2. 打开 **SQL Editor**，粘贴并执行 `achievements.sql` 的完整内容。
3. 打开 **Authentication > Users**，创建管理员账号，并在创建时确认邮箱。
4. 回到 SQL Editor，把该账号加入管理员白名单：

   ```sql
   insert into public.achievement_admins (user_id)
   select id from auth.users where email = 'chuyu@nju.edu.cn'
   on conflict (user_id) do nothing;
   ```

   如果登录邮箱不是 `chuyu@nju.edu.cn`，请相应替换 SQL 中的邮箱。

5. 确认管理员可以登录后，在
   **Authentication > Sign In / Providers > Email** 中关闭新用户注册，并保持
   Anonymous Sign-Ins 关闭。

初始化 SQL 会创建私有的 `achievement-files` 存储桶、20 MB 和 MIME 类型限制、
三张数据表及全部 RLS 策略。

## 2. 配置站点地址和密码重置

在 **Authentication > URL Configuration** 中填写：

- Site URL：`https://chuyunju.github.io`
- Redirect URL：`https://chuyunju.github.io/achievements/`

保持邮箱密码登录开启。正式使用“忘记密码”前，还需要确认 Supabase 邮件服务或
自定义 SMTP 已经配置完成。

## 3. 连接 GitHub Pages 页面

打开 `assets/js/achievements-config.js`，只替换以下两个占位值：

```js
supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
supabaseKey: "YOUR_SUPABASE_PUBLISHABLE_KEY"
```

Project URL 和 **publishable key**（或旧项目的 `anon` key）可以从 Supabase
项目的 API 设置中复制。绝不能在浏览器代码中使用或提交 secret key、
`service_role` key。

## 4. 正式录入前验证

1. 在无痕浏览器中访问 `/achievements/`。空目录应能正常加载，但直接读取
   `achievement_private` 或 Storage 存储桶必须失败。
2. 使用管理员账号登录，分别创建奖励、专利和软著测试记录。
3. 上传一个 PDF 或图片，依次测试预览、下载、替换和永久删除。
4. 退出登录，确认公开目录仍可见，但备注、文件名和附件内容均不可访问。

Supabase 在这里用于检索和访问控制，不能代替原始资料备份。证书和相关文件仍应
保留独立的本地备份。
