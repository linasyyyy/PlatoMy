const targetGuild = client.guilds.cache.first() || null;
    const players = [];
    for (const entry of sorted) {
      const val = entry[meta.field] || 0;
      let name = "Empty Slot";
      let initials = "--";
      let img = null;
      if (entry.id) {
        try {
          const member = targetGuild
            ? await targetGuild.members.fetch(entry.id).catch(() => null)
            : null;
          const user = member?.user || (await client.users.fetch(entry.id));
          name = member?.displayName || user.displayName || user.globalName || user.username || "User";
          initials = Array.from(name.trim()).slice(0, 2).join("").toUpperCase() || "--";
          const avatarUrl = (member || user).displayAvatarURL({ extension: "png", size: 128 });
          try {
            img = await loadImage(avatarUrl);
          } catch {}
        } catch {
          name = "Unknown";
          initials = "UN";
        }
      }
      const sub = meta.subText(val);
      const sp = sub.indexOf(" ");
      players.push({
        hasUser: Boolean(entry.id),
        name,
        initials,
        img,
        num: sp > 0 ? sub.slice(0, sp) : sub,
        unit: sp > 0 ? sub.slice(sp + 1) : "",
        level: entry.id ? getLevelInfo(val).level : 0,
      });
    }
