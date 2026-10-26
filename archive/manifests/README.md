# 发布清单说明

复制模板 `release.template.json` 到 `archive/releases/<版本>/release.json`，用实际发布信息填写。

- `commit` 必须是发布 tag 指向的提交；
- `tag` 必须是 annotated tag；
- `checks` 只记录实际跑过的命令和结果；
- `migration.applied` 记录是否已在线上的数据库执行；
- `backup.ref` 只写受控备份的相对位置或运维编号，不要复制数据库；
- `assets` 只记录可公开的构建文件名和 SHA-256，不包含证书或密钥。