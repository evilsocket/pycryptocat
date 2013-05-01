// curve25519

// In order to generate a public value:
//   priv = BigInt.randBigInt(256)
//   pub = scalarMult(priv, basePoint)
//
// In order to perform key agreement:
//   shared = scalarMult(myPrivate, theirPublic)

/*
Here's a test: this should print the same thing twice.
var priv1 = BigInt.randBigInt(256, 0)
var priv2 = BigInt.randBigInt(256, 0)
var pub1 = scalarMult(priv1, basePoint)
var pub2 = scalarMult(priv2, basePoint)
print (scalarMult(priv1, pub2))
print (scalarMult(priv2, pub1)) */

var Curve25519 = function() {
};

(function(){

// p25519 is the curve25519 prime: 2^255 - 19
Curve25519.p25519 = BigInt.str2bigInt("7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed", 16);
// p25519Minus2 = 2^255 - 21
var p25519Minus2 = BigInt.str2bigInt("7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeb", 16);
// a is a parameter of the elliptic curve
var a = BigInt.str2bigInt("486662", 10);
// basePoint is the generator of the elliptic curve group
var basePoint = BigInt.str2bigInt("9", 10);

// These variables are names for small, bigint constants.
var eight = BigInt.str2bigInt("8", 10);
var four = BigInt.str2bigInt("4", 10);
var three = BigInt.str2bigInt("3", 10);
var two = BigInt.str2bigInt("2", 10);
var one = BigInt.str2bigInt("1", 10);
var zero = BigInt.str2bigInt("0", 10);

// groupAdd adds two elements of the elliptic curve group in Montgomery form.
function groupAdd(x1, xn, zn, xm, zm) {
        // x₃ = 4(x·x′ - z·z′)² · z1
        var xx = BigInt.multMod(xn, xm, Curve25519.p25519);
        var zz = BigInt.multMod(zn, zm, Curve25519.p25519);
        var d;
        if (BigInt.greater(xx, zz)) {
                d = BigInt.sub(xx, zz);
        } else {
                d = BigInt.sub(zz, xx);
        }
        var sq = BigInt.multMod(d, d, Curve25519.p25519);
        var outx = BigInt.multMod(sq, four, Curve25519.p25519);

        // z₃ = 4(x·z′ - z·x′)² · x1
        var xz = BigInt.multMod(xm, zn, Curve25519.p25519);
        var zx = BigInt.multMod(zm, xn, Curve25519.p25519);
        var d;
        if (BigInt.greater(xz, zx)) {
            d = BigInt.sub(xz, zx);
        } else {
            d = BigInt.sub(zx, xz);
        }
        var sq = BigInt.multMod(d, d, Curve25519.p25519);
        var sq2 = BigInt.multMod(sq, x1, Curve25519.p25519);
        var outz = BigInt.multMod(sq2, four, Curve25519.p25519);

        return [outx, outz];
}

// groupDouble doubles a point in the elliptic curve group.
function groupDouble(x, z) {
        // x₂ = (x² - z²)²
        var xx = BigInt.multMod(x, x, Curve25519.p25519);
        var zz = BigInt.multMod(z, z, Curve25519.p25519);
        var d;
        if (BigInt.greater(xx, zz)) {
          d = BigInt.sub(xx, zz);
        } else {
          d = BigInt.sub(zz, xx);
        }
        var outx = BigInt.multMod(d, d, Curve25519.p25519);

        // z₂ = 4xz·(x² + Axz + z²)
        var s = BigInt.add(xx, zz);
        var xz = BigInt.multMod(x, z, Curve25519.p25519);
        var axz = BigInt.mult(xz, a);
        s = BigInt.add(s, axz);
        var fourxz = BigInt.mult(xz, four);
        var outz = BigInt.multMod(fourxz, s, Curve25519.p25519);

        return [outx, outz];
}

// scalarMult calculates i*base in the elliptic curve.
Curve25519.scalarMult = function(i, base) {
        var scalar = BigInt.expand(i, 18);
        scalar[0] &= (248 | 0x7f00);
        scalar[17] = 0;
        scalar[16] |= 0x4000;

        var x1 = BigInt.str2bigInt("1", 10);
        var z1 = BigInt.str2bigInt("0", 10);
        var x2 = base;
        var z2 = BigInt.str2bigInt("1", 10);

        for (i = 17; i >= 0; i--) {
                var j = 14;
                if (i == 17) {
                        j = 0;
                }
                for (; j >= 0; j--) {
                        if (scalar[i]&0x4000) {
                                var point = groupAdd(base, x1, z1, x2, z2);
                                x1 = point[0];
                                z1 = point[1];
                                point = groupDouble(x2, z2);
                                x2 = point[0];
                                z2 = point[1];
                        } else {
                                var point = groupAdd(base, x1, z1, x2, z2);
                                x2 = point[0];
                                z2 = point[1];
                                point = groupDouble(x1, z1);
                                x1 = point[0];
                                z1 = point[1];
                        }
                        scalar[i] <<= 1;
                }
        }

        var z1inv = BigInt.powMod(z1, p25519Minus2, Curve25519.p25519);
        var x = BigInt.multMod(z1inv, x1, Curve25519.p25519);

        return x;
}


// P256



// var priv = BigInt.randBigInt(256)
// var pub = scalarMultP256(p256Gx, p256Gy, priv)
// var message = BigInt.str2bigInt("2349623424239482634", 10)
// var signature = ecdsaSign(priv, message)
// print (ecdsaVerify(pub, signature, message))

// p256 is the p256 prime
var p256 = BigInt.str2bigInt("115792089210356248762697446949407573530086143415290314195533631308867097853951", 10);
// n256 is the number of points in the group
var n256 = BigInt.str2bigInt("115792089210356248762697446949407573529996955224135760342422259061068512044369", 10);
// b256 is a parameter of the curve
var b256 = BigInt.str2bigInt("5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b", 16);
// p256Gx and p256Gy is the generator of the group
var p256Gx = BigInt.str2bigInt("6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296", 16);
var p256Gy = BigInt.str2bigInt("4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5", 16);




Curve25519.privateKeyToString = function(p){
  return BigInt.bigInt2str(p, 64);
}

Curve25519.privateKeyFromString = function(s){
  return BigInt.str2bigInt(s, 64);
}


Curve25519.sigToString = function(p){
  return JSON.stringify([BigInt.bigInt2str(p[0], 64), BigInt.bigInt2str(p[1], 64)]);
}

Curve25519.sigFromString = function(s){
  p = JSON.parse(s);
  p[0] = BigInt.str2bigInt(p[0], 64);
  p[1] = BigInt.str2bigInt(p[1], 64);
  return p;
}

Curve25519.publicKeyToString = function(p){
  return JSON.stringify([BigInt.bigInt2str(p[0], 64), BigInt.bigInt2str(p[1], 64)]);
}

Curve25519.publicKeyFromString = function(s){
  p = JSON.parse(s);
  p[0] = BigInt.str2bigInt(p[0], 64);
  p[1] = BigInt.str2bigInt(p[1], 64);
  return p;
}

Curve25519.ecdsaGenPrivateKey = function(){
  return Curve25519.privateKeyToString(BigInt.randBigInt(256));
}

Curve25519.ecdsaGenPublicKey = function(privateKey){
  return Curve25519.publicKeyToString(scalarMultP256(p256Gx, p256Gy, Curve25519.privateKeyFromString(privateKey)));
}

// isOnCurve returns true if the given point is on the curve.
function isOnCurve(x, y) {
        // y² = x³ - 3x + b
        var yy = BigInt.multMod(y, y, p);
        var xxx = BigInt.multMod(x, mult(x, x), p);
        var threex = BigInt.multMod(three, x, p);
        var s = BigInt.add(xxx, b256);
        if (BigInt.greater(threex, s)) {
                return false;
        }
        s = BigInt.sub(s, threex);
        return equals(s, yy);
}

// subMod returns a-b mod m
function subMod(a, b, m) {
        if (BigInt.greater(a, b)) {
                return BigInt.mod(BigInt.sub(a, b), m);
        }
        tmp = BigInt.mod(BigInt.sub(b, a), m);
        return BigInt.sub(m, tmp);

}

// addJacobian adds two elliptic curve points in Jacobian form.
function addJacobian(x1, y1, z1, x2, y2, z2) {
        if (isZero(z1)) {
                return [x2, y2, z2];
        }
        if (isZero(z2)) {
                return [x1, y1, z1];
        }
        var z1z1 = BigInt.multMod(z1, z1, p256);
        var z2z2 = BigInt.multMod(z2, z2, p256);
        var u1 = BigInt.multMod(x1, z2z2, p256);
        var u2 = BigInt.multMod(x2, z1z1, p256);
        var s1 = BigInt.multMod(y1, BigInt.multMod(z2, z2z2, p256), p256);
        var s2 = BigInt.multMod(y2, BigInt.multMod(z1, z1z1, p256), p256);
        var h = subMod(u2, u1, p256);
        var xEqual = isZero(h);
        var i = BigInt.mult(h, two);
        i = BigInt.multMod(i, i, p256);
        j = BigInt.multMod(h, i, p256);

        var r = subMod(s2, s1, p256);
        var yEqual = isZero(r);
        if (xEqual && yEqual) {
                return doubleJacobian(x1, y1, z1);
        }
        r = BigInt.mult(r, two);

        var v = BigInt.multMod(u1, i, p256);
        var x3 = BigInt.mult(r, r);
        x3 = subMod(x3, j, p256);
        var twoV = BigInt.mult(v, two);
        x3 = subMod(x3, twoV, p256);

        var tmp = subMod(v, x3, p256);
        tmp = BigInt.mult(r, tmp);
        var y3 = BigInt.mult(s1, j);
        y3 = BigInt.mult(y3, two);
        y3 = subMod(tmp, y3, p256);

        var tmp = BigInt.add(z1, z2);
        tmp = BigInt.multMod(tmp, tmp, p256);
        tmp = subMod(tmp, z1z1, p256);
        tmp = subMod(tmp, z2z2, p256);
        var z3 = BigInt.multMod(tmp, h, p256);

        return [x3, y3, z3];
}

// doubleJacobian doubles an elliptic curve point in Jacobian form.
function doubleJacobian(x, y, z) {
        var delta = BigInt.multMod(z, z, p256);
        var gamma = BigInt.multMod(y, y, p256);
        var beta = BigInt.multMod(x, gamma, p256);
        var alpha = BigInt.mult(three, BigInt.mult(subMod(x, delta, p256), BigInt.add(x, delta)));
        var x3 = subMod(BigInt.multMod(alpha, alpha, p256), BigInt.mult(eight, beta), p256);
        var tmp = BigInt.add(y, z);
        tmp = BigInt.mult(tmp, tmp);
        var z3 = subMod(subMod(tmp, gamma, p256), delta, p256);
        tmp = BigInt.mult(eight, BigInt.mult(gamma, gamma));
        var y3 = subMod(BigInt.multMod(alpha, subMod(BigInt.mult(four, beta), x3, p256), p256), tmp, p256);

        return [x3, y3, z3];
}

// affineFromJacobian returns the affine point corresponding to the given
// Jacobian point.
function affineFromJacobian(x, y, z) {
        if (isZero(z)) {
                return [null, null];
        }
        var zinv = BigInt.inverseMod(z, p256);
        var zinvsq = BigInt.multMod(zinv, zinv, p256);

        var outx = BigInt.multMod(x, zinvsq, p256);
        var zinv3 = BigInt.multMod(zinvsq, zinv, p256);
        var outy = BigInt.multMod(y, zinv3, p256);

        return [outx, outy];
}

// scalarMultP256 returns in_k*(bx,by)
function scalarMultP256(bx, by, in_k) {
        var bz = [1, 0];
        var k = BigInt.dup(in_k);

        var x = zero;
        var y = one;
        var z = zero;

        for (var i = k.length-1; i >= 0; i--) {
                for (var j = 14; j >= 0; j--) {
                  var point = doubleJacobian(x, y, z);
                  x = point[0];
                  y = point[1];
                  z = point[2];
                  if (k[i]&0x4000) {
                          var point = addJacobian(bx, by, bz, x, y, z);
                          x = point[0];
                          y = point[1];
                          z = point[2];
                  }
                  k[i] <<= 1;
                }
        }

        return affineFromJacobian(x, y, z);
}

// ecdsaSign returns a signature of message as an array [r,s]. message is a
// bigint, however it should be generated by hashing the true message and
// converting it to bigint. Note: if attempting to interoperate you should be
// careful because the NSA and SECG documents differ on how the conversion to
// an interger occurs. SECG says that you should truncate to the big-length of
// the curve first and that's what OpenSSL does.
Curve25519.ecdsaSign = function(privateKey, message) {
        var r;
        var s;

        priv = Curve25519.privateKeyFromString(privateKey);

        m = BigInt.mod(CryptoJS.SHA512(JSON.stringify(message)).toString(CryptoJS.enc.Hex).substring(0,32), n256);

        while (true) {
                var k;
                while (true) {
                        k = BigInt.randBigInt(256);
                        var point = scalarMultP256(p256Gx, p256Gy, k);
                        var r = point[0];
                        r = BigInt.mod(r, n256);
                        if (!BigInt.isZero(r)) {
                                break;
                        }
                }

                var s = BigInt.multMod(priv, r, n256);
                s = BigInt.add(s, m);
                kinv = BigInt.inverseMod(k, n256);
                s = BigInt.multMod(s, kinv, n256);
                if (!BigInt.isZero(s)) {
                        break;
                }
        }

        return Curve25519.sigToString([r,s]);
}

// ecdsaVerify returns true iff signature is a valid ECDSA signature for
// message. See the comment above ecdsaSign about converting a message into the
// bigint |message|.
Curve25519.ecdsaVerify = function(publicKey, signature, message) {

        pub = Curve25519.publicKeyFromString(publicKey);
        sig = Curve25519.sigFromString(signature);

        m = BigInt.mod(CryptoJS.SHA512(JSON.stringify(message)).toString(CryptoJS.enc.Hex).substring(0,32), n256);

        var r = sig[0]
        var s = sig[1]

        if (BigInt.isZero(r) || BigInt.isZero(s)) {
                return false;
        }

        if (BigInt.greater(r, n256) || BigInt.greater(s, n256)) {
                return false;
        }

        var w = BigInt.inverseMod(s, n256);
        var u1 = BigInt.multMod(m, w, n256);
        var u2 = BigInt.multMod(r, w, n256);

        var one = [1, 0];
        var point1 = scalarMultP256(p256Gx, p256Gy, u1);
        var point2 = scalarMultP256(pub[0], pub[1], u2);
        var point3 = addJacobian(point1[0], point1[1], one, point2[0], point2[1], one);
        var point4 = affineFromJacobian(point3[0], point3[1], point3[2]);
        if (point4[0] == null) {
                return false;
        }
        BigInt.mod(point4[0], n256);
        return BigInt.equals(point4[0], r);
}

Curve25519.ecDH = function(priv, pub) {
        if (typeof pub === "undefined") {
                return Curve25519.scalarMult(priv, basePoint);
        }
        else {
                return BigInt.bigInt2str(Curve25519.scalarMult(priv, pub), 64);
        }
}
})();
