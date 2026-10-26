-- LOCAL DEVELOPMENT ONLY: sample data so the studio has something to show.
-- Not used in production (the hosted database never runs this file).

insert into private.job_config (key, value) values
  ('functions_url', 'http://host.docker.internal:54321/functions/v1'),
  ('cron_secret', 'local-dev-secret')
on conflict (key) do update set value = excluded.value;

update public.creator_settings set
  creator_email = 'creator@example.test',
  display_name = 'Niveditha DeveGowda',
  handle = 'nicks_universe_it_is',
  niche = ' Lifestyle, Travel, Fashion, Yoga, Wellness',
  city = 'Bangalore',
  followers = '20.1K',
  engagement = '4.8%',
  reply_time = '1 days',
  site_url = 'http://localhost:5173'
where id = 1;

do $$
declare
  t date := current_date;
  b_lumiere uuid; b_velvet uuid; b_saffron uuid; b_kora uuid; b_northstar uuid;
  b_glass uuid; b_hearth uuid; b_aura uuid; b_tinker uuid; b_kaju uuid; b_pepper uuid;
  c uuid;
begin
  insert into public.brands (name, instagram, category) values ('Lumière Skin', 'lumiere.skin', 'Skincare') returning id into b_lumiere;
  insert into public.brands (name, instagram, category) values ('Velvet Bean Coffee', 'velvetbean.co', 'Food & drink') returning id into b_velvet;
  insert into public.brands (name, instagram, category) values ('Saffron Thread', 'saffronthread', 'Fashion') returning id into b_saffron;
  insert into public.brands (name, instagram, category) values ('Kora Activewear', 'kora.active', 'Fitness') returning id into b_kora;
  insert into public.brands (name, instagram, category) values ('Northstar Travel', 'northstar.trips', 'Travel') returning id into b_northstar;
  insert into public.brands (name, instagram, category) values ('Glasshouse Eyewear', 'glasshouse.eye', 'Fashion') returning id into b_glass;
  insert into public.brands (name, instagram, category) values ('Hearth Home', 'hearth.home', 'Home') returning id into b_hearth;
  insert into public.brands (name, instagram, category) values ('Aura Wellness', 'aura.wellness', 'Wellness') returning id into b_aura;
  insert into public.brands (name, instagram, category) values ('Tinker Jewels', 'tinker.jewels', 'Jewellery') returning id into b_tinker;
  insert into public.brands (name, instagram, category) values ('Kaju & Co.', 'kajuandco', 'Food & drink') returning id into b_kaju;
  insert into public.brands (name, instagram, category) values ('Pepper & Pine', 'pepperandpine', 'Food & drink') returning id into b_pepper;

  insert into public.collabs (brand_id, source, contact_name, contact_email, type, stage, fee, usage, brief, received_on, product_date, draft_date, live_date, pay_status, pay_received, invoice_no, pay_due, note_for_brand)
  values (b_lumiere, 'brand_page', 'Meera Shah', 'meera@lumiere.test', 'paid', 'creating', 45000, '60 days paid ads',
    'Launch of the Vitamin C night serum. Texture shots and a 7-day glow routine. Mention code RIYA15.',
    t - 18, t - 6, t + 2, t + 6, 'advance', 22500, 'INV-1046', t + 20, 'Shooting this weekend. The draft reel will reach you in two days.')
  returning id into c;
  insert into public.deliverables (collab_id, kind, qty, position) values (c, 'Reel', 1, 0), (c, 'Story', 3, 1);

  insert into public.collabs (brand_id, contact_name, contact_email, type, stage, product, product_value, received_on, product_date, draft_date, live_date, follow_date, follow_note, note_for_brand)
  values (b_velvet, 'Arjun Rao', 'arjun@velvetbean.test', 'barter', 'live', 'Pour-over kit and 3 single-origin blends', 6800,
    t - 25, t - 14, t - 7, t - 3, t, 'Send 7-day insights (reach, saves, shares)', 'The reel is live. Insights coming after 7 days.')
  returning id into c;
  insert into public.deliverables (collab_id, kind, qty, done) values (c, 'Reel', 1, true);

  insert into public.collabs (brand_id, source, contact_name, contact_email, type, stage, fee, usage, brief, received_on, preferred_live, follow_date, follow_note)
  values (b_saffron, 'brand_page', 'Ishita Menon', 'ishita@saffron.test', 'paid', 'negotiating', 32000, '30 days paid ads',
    'Festive edit: 3 handloom sarees styled three ways.', t - 4, t + 16, t - 1, 'Reply to their ₹24,000 counter-offer')
  returning id into c;
  insert into public.deliverables (collab_id, kind, qty, position) values (c, 'Carousel', 1, 0), (c, 'Story', 2, 1);

  insert into public.collabs (brand_id, source, contact_name, contact_email, type, stage, fee, product, product_value, usage, brief, received_on, preferred_live)
  values (b_kora, 'brand_page', 'Nikhil Batra', 'nikhil@kora.test', 'hybrid', 'request', 60000, 'Winter running set (2 looks)', 12000, '30 days paid ads',
    'Winter running collection. One routine reel, one styling reel.', t - 1, t + 21)
  returning id into c;
  insert into public.deliverables (collab_id, kind, qty) values (c, 'Reel', 2);

  insert into public.collabs (brand_id, contact_name, contact_email, type, stage, fee, usage, received_on, draft_date, live_date, pay_status, invoice_no, invoiced_on, pay_due, follow_date, follow_note)
  values (b_northstar, 'Kabir Sethi', 'kabir@northstar.test', 'paid', 'live', 85000, '90 days paid ads', t - 45, t - 28, t - 20,
    'invoiced', 'INV-1043', t - 19, t - 5, t, 'Chase payment with their accounts team')
  returning id into c;
  insert into public.deliverables (collab_id, kind, qty, done, position) values (c, 'Reel', 1, true, 0), (c, 'Carousel', 1, true, 1);

  insert into public.collabs (brand_id, contact_name, contact_email, type, stage, fee, received_on, draft_date, live_date, pay_status, invoice_no, invoiced_on, pay_due, follow_date, follow_note)
  values (b_glass, 'Rhea Dsouza', 'rhea@glasshouse.test', 'paid', 'live', 35000, t - 30, t - 10, t - 6, 'invoiced', 'INV-1045', t - 5, t + 9, t + 4, 'Share 7-day insights')
  returning id into c;
  insert into public.deliverables (collab_id, kind, qty, done) values (c, 'Reel', 1, true);

  insert into public.collabs (brand_id, contact_name, contact_email, type, stage, fee, received_on, product_date, draft_date, live_date, note_for_brand)
  values (b_hearth, 'Tanvi Kulkarni', 'tanvi@hearth.test', 'paid', 'confirmed', 38000, t - 10, t + 1, t + 8, t + 12, 'Confirmed. Waiting for the product to arrive.')
  returning id into c;
  insert into public.deliverables (collab_id, kind, qty, position) values (c, 'Reel', 1, 0), (c, 'Static post', 1, 1);

  insert into public.collabs (brand_id, contact_name, contact_email, type, stage, fee, received_on, product_date, draft_date, live_date)
  values (b_aura, 'Dev Malhotra', 'dev@aura.test', 'paid', 'creating', 18000, t - 14, t - 7, t, t + 3)
  returning id into c;
  insert into public.deliverables (collab_id, kind, qty) values (c, 'Story', 4);

  insert into public.collabs (brand_id, contact_name, contact_email, type, stage, fee, received_on, live_date, pay_status, pay_received, invoice_no, invoiced_on, pay_due, paid_on)
  values (b_tinker, 'Pooja Nair', 'pooja@tinker.test', 'paid', 'wrapped', 28000, t - 40, t - 22, 'paid', 28000, 'INV-1040', t - 20, t - 10, t - 8)
  returning id into c;
  insert into public.deliverables (collab_id, kind, qty, done) values (c, 'Reel', 1, true);

  insert into public.collabs (brand_id, contact_name, contact_email, type, stage, fee, received_on, live_date, pay_status, pay_received, invoice_no, invoiced_on, pay_due, paid_on)
  values (b_kaju, 'Rohan Gupta', 'rohan@kaju.test', 'paid', 'wrapped', 22000, t - 38, t - 16, 'paid', 22000, 'INV-1041', t - 15, t - 6, t - 12)
  returning id into c;
  insert into public.deliverables (collab_id, kind, qty, done) values (c, 'Carousel', 1, true);

  insert into public.collabs (brand_id, contact_name, contact_email, type, stage, product, product_value, received_on, product_date, live_date)
  values (b_pepper, 'Leah Fernandes', 'leah@pepper.test', 'barter', 'wrapped', 'Gourmet breakfast hamper', 4500, t - 50, t - 40, t - 30)
  returning id into c;
  insert into public.deliverables (collab_id, kind, qty, done) values (c, 'Reel', 1, true);

  -- Older paid collabs so the income chart has history.
  insert into public.collabs (brand_id, contact_name, type, stage, fee, received_on, live_date, pay_status, pay_received, paid_on) values
    (b_tinker, 'Pooja Nair', 'paid', 'wrapped', 62000, t - 160, t - 150, 'paid', 62000, t - 140),
    (b_glass, 'Rhea Dsouza', 'paid', 'wrapped', 88000, t - 130, t - 118, 'paid', 88000, t - 110),
    (b_kaju, 'Rohan Gupta', 'paid', 'wrapped', 54000, t - 100, t - 90, 'paid', 54000, t - 80),
    (b_northstar, 'Kabir Sethi', 'paid', 'wrapped', 121000, t - 70, t - 60, 'paid', 121000, t - 50),
    (b_lumiere, 'Meera Shah', 'paid', 'wrapped', 97000, t - 45, t - 38, 'paid', 97000, t - 30);
end $$;

-- Activity for every sample collab.
insert into public.collab_events (collab_id, at, kind, text, visible_to_brand)
select id, received_on::timestamptz + interval '10 hours', 'stage', 'Request received', true from public.collabs;

-- The outbox trigger is not useful for sample data.
delete from public.outbox;

-- Tests keep approving creators by hand (live approves new sign-ups straight away: Growth Autopilot, migration 163).
update public.growth_settings set auto_approve = false where id = 1;
