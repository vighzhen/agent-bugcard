"""通过命令行验证浏览器离线包，不处理真实用户日志。"""

import subprocess
import sys
import unittest
import warnings
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / 'scripts/pack-offline.py'


class OfflinePackageTest(unittest.TestCase):
    def run_pack(self, *args):
        return subprocess.run(
            [sys.executable, str(PACK), *map(str, args)],
            cwd=ROOT, capture_output=True, text=True, check=False,
        )

    def test_verified_bundle_and_rejected_variants(self):
        with TemporaryDirectory() as directory:
            archive = Path(directory) / 'test.zip'
            self.assertEqual(self.run_pack(archive).returncode, 0)
            self.assertEqual(self.run_pack('--check', archive).returncode, 0)
            with ZipFile(archive) as package:
                files = [(name, package.read(name)) for name in package.namelist()]
            self.assertEqual({name for name, _ in files}, {
                'agent-bugcard.html', 'README.txt', 'LICENSE',
            })

            cases = {
                'extra': files + [('synthetic-extra.jsonl', b'{}\n')],
                'missing': [item for item in files if item[0] != 'README.txt'],
                'duplicate': files + files[:1],
                'stale': [
                    (name, b'stale') if name == 'README.txt' else (name, value)
                    for name, value in files
                ],
                'wrong-license': [
                    (name, b'wrong') if name == 'LICENSE' else (name, value)
                    for name, value in files
                ],
            }
            for case, entries in cases.items():
                with self.subTest(case=case):
                    with warnings.catch_warnings(), ZipFile(archive, 'w') as package:
                        warnings.filterwarnings('ignore', message='Duplicate name:')
                        for name, value in entries:
                            package.writestr(name, value)
                    result = self.run_pack('--check', archive)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn('Offline ZIP', result.stderr)
                    self.assertNotIn('synthetic-extra', result.stderr)
            archive.write_bytes(b'not a ZIP')
            result = self.run_pack('--check', archive)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('corrupt', result.stderr)
