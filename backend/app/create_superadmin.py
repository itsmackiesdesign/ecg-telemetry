"""Run from backend: python -m app.create_superadmin email@example.com"""
import argparse
from getpass import getpass
from .main import database, pwd

def main():
    parser=argparse.ArgumentParser(description='Create a superadmin using server access. Existing users are never changed.')
    parser.add_argument('email')
    args=parser.parse_args();email=args.email.strip().lower()
    if '@' not in email: parser.error('Enter a valid email')
    with database() as db:
        if db.execute('select 1 from users where email=?',(email,)).fetchone():
            parser.error('Account already exists. Use a separate administrator email.')
    password=getpass('Password (10–128 characters): ')
    if not 10<=len(password)<=128: parser.error('Password must contain 10–128 characters')
    if password!=getpass('Confirm password: '): parser.error('Passwords do not match')
    with database() as db:
        db.execute('insert into users values(?,?,?,?)',(email,'Super administrator','superadmin',pwd.hash(password)))
    print('Superadmin created. Sign in using the normal login page.')

if __name__=='__main__': main()
