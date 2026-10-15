-- Dates like "received today" follow India time, not UTC.
alter database postgres set timezone to 'Asia/Kolkata';
