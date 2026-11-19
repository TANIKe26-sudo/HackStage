ALTER TABLE profiles ADD COLUMN prefecture_code TEXT
  CHECK(prefecture_code IN (
    '01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23',
    '24','25','26','27','28','29','30','31','32','33','34','35','36','37','38','39','40','41','42','43','44','45','46','47'
  ));

ALTER TABLE discovery_preferences ADD COLUMN location_range TEXT
  CHECK(location_range IN ('same_prefecture','same_region','anywhere'));
