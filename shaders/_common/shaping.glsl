
// ----- POLYNOMIAL SHAPING FUNCTIONS -----
// From: http://www.flong.com/archive/texts/code/shapers_poly/
//   A collection of polynomial functions for shaping, tweening, and easing signals in the range [0...1].

// Blinn-Wyvill Approximation to the Raised Inverted Cosine
//   Useful approximation for the cos() and sin() trigonometric functions
float blinnWyvillCosineApproximation (float x){
    float x2 = x*x;
    float x4 = x2*x2;
    float x6 = x4*x2;
    
    const float fa = ( 4.0/9.0);
    const float fb = (17.0/9.0);
    const float fc = (22.0/9.0);
    
    float y = fa*x6 - fb*x4 + fc*x2;
    return y;
}

// Double-Cubic Seat 
//   This seat-shaped function is formed by joining two 3rd-order polynomial (cubic) curves. 
//   The curves meet with a horizontal inflection point at the control coordinate (a,b) in the unit square.
float doubleCubicSeat (float x, float a, float b){
    float epsilon = 0.00001;
    float min_param_a = 0.0 + epsilon;
    float max_param_a = 1.0 - epsilon;
    float min_param_b = 0.0;
    float max_param_b = 1.0;
    a = min(max_param_a, max(min_param_a, a));  
    b = min(max_param_b, max(min_param_b, b)); 
    
    float y = 0.0;
    if (x <= a){
        y = b - b*pow(1.0-x/a, 3.0);
    } else {
        y = b + (1.0-b)*pow((x-a)/(1.0-a), 3.0);
    }
    return y;
}

// Double-Cubic Seat with Linear Blend
//  This modified version of the Double-Cubic Seat function uses a single variable to control the location of its inflection point along the diagonal of the unit square. 
//  A second parameter is used to blend this curve with the Identity Function (y=x). 
//  Here, we use the variable b to control the amount of this blend, which has the effect of tilting the slope of the curve's plateau in the vicinity of its inflection point. 
//  The adjustable flattening around the inflection point makes this a useful shaping function for lensing or magnifying evenly-spaced data.
float doubleCubicSeatWithLinearBlend (float x, float a, float b){
    float epsilon = 0.00001;
    float min_param_a = 0.0 + epsilon;
    float max_param_a = 1.0 - epsilon;
    float min_param_b = 0.0;
    float max_param_b = 1.0;
    a = min(max_param_a, max(min_param_a, a));  
    b = min(max_param_b, max(min_param_b, b)); 
    b = 1.0 - b; //reverse for intelligibility.
    
    float y = 0.0;
    if (x<=a){
        y = b*x + (1.0-b)*a*(1.0-pow(1.0-x/a, 3.0));
    } else {
        y = b*x + (1.0-b)*(a + (1.0-a)*pow((x-a)/(1.0-a), 3.0));
    }
    return y;
}

// Double-Odd-Polynomial Seat
//   The previous Double-Cubic Seat function can be generalized to a form which uses any odd integer exponent. 
//   In the code below, the parameter n controls the flatness or breadth of the plateau region in the vicinity of the point (a,b). 
//   A good working range for n is the set of whole numbers from 1 to about 20.
float doubleOddPolynomialSeat (float x, float a, float b, int n){
    float epsilon = 0.00001;
    float min_param_a = 0.0 + epsilon;
    float max_param_a = 1.0 - epsilon;
    float min_param_b = 0.0;
    float max_param_b = 1.0;
    a = min(max_param_a, max(min_param_a, a));  
    b = min(max_param_b, max(min_param_b, b)); 

    int p = 2*n + 1;
    float y = 0.0;
    if (x <= a){
        y = b - b*pow(1.0-x/a, float(p));
    } else {
        y = b + (1.0-b)*pow((x-a)/(1.0-a), float(p));
    }
    return y;
}

// Symmetric Double-Polynomial Sigmoids
//   It is possible to generate sigmoid patterns by joining a symmetric pair of polynomials at the center of the unit square. 
//   The exponents in these equations (controlled by the integer parameter n) control the steepness of the wall separating the squelched values from the boosted ones; 
//   a suggested range for the whole number n is from 1 to about 10. 
//   Of these, the sigmoid created with a 2nd-order (quadratic) exponent comes closest to the Raised Inverted Cosine, approximating it to within 2.8%.
float doublePolynomialSigmoid (float x, float a, float b, int n){
    float y = 0.0;
    if (n - 2 * (n / 2) == 0) {
        // even polynomial
        if (x<=0.5){
            y = pow(2.0*x, float(n))/2.0;
        } else {
            y = 1.0 - pow(2.0*(x-1.0), float(n))/2.0;
        }
    } 
    
    else { 
        // odd polynomial
        if (x<=0.5){
            y = pow(2.0*x, float(n))/2.0;
        } else {
            y = 1.0 + pow(2.0*(x-1.0), float(n))/2.0;
        }
    }

    return y;
}

// Quadratic Through a Given Point
//   This function defines an axis-aligned quadratic (parabola) which passes through a user-supplied point (a,b) in the unit square. 
//   Caution: Not all points in the unit square will produce curves which pass through the locations (0,0) and (1,1).
float quadraticThroughAGivenPoint (float x, float a, float b){
    float epsilon = 0.00001;
    float min_param_a = 0.0 + epsilon;
    float max_param_a = 1.0 - epsilon;
    float min_param_b = 0.0;
    float max_param_b = 1.0;
    a = min(max_param_a, max(min_param_a, a));  
    b = min(max_param_b, max(min_param_b, b)); 
    
    float A = (1.0-b)/(1.0-a) - (b/a);
    float B = (A*(a*a)-b)/a;
    float y = A*(x*x) - B*(x);
    y = min(1.0,max(0.0,y)); 
    
    return y;
}





// ----- EXPONENTIAL SHAPIONG FUNCTIONS -----
// From: https://www.flong.com/archive/texts/code/shapers_exp/

// Exponential Ease-In and Ease-Out
//   In this implementation of an exponential shaping function, the control parameter a permits the designer to vary the function from an ease-out form to an ease-in form.
float exponentialEasing (float x, float a){
    float epsilon = 0.00001;
    float min_param_a = 0.0 + epsilon;
    float max_param_a = 1.0 - epsilon;
    a = max(min_param_a, min(max_param_a, a));
    
    if (a < 0.5){
        // emphasis
        a = 2.0*(a);
        float y = pow(x, a);
        return y;
    } else {
        // de-emphasis
        a = 2.0*(a-0.5);
        float y = pow(x, 1.0/(1.0-a));
        return y;
    }
}

// Double-Exponential Seat
//   A seat-shaped function can be created with a coupling of two exponential functions. 
//   This has nicer derivatives than the cubic function, and more continuous control in some respects, at the expense of greater CPU cycles. 
//   The recommended range for the control parameter a is from 0 to 1.
//   Note that these equations are very similar to the Double-Exponential Sigmoid described below. 
float doubleExponentialSeat (float x, float a){
    float epsilon = 0.00001;
    float min_param_a = 0.0 + epsilon;
    float max_param_a = 1.0 - epsilon;
    a = min(max_param_a, max(min_param_a, a)); 

    float y = 0.0;
    if (x<=0.5){
        y = (pow(2.0*x, 1.0-a))/2.0;
    } else {
        y = 1.0 - (pow(2.0*(1.0-x), 1.0-a))/2.0;
    }
    return y;
}

// Double-Exponential Sigmoid
//   The same doubling-and-flipping scheme can be used to create sigmoids from pairs of exponential functions. 
//   These have the advantage that the control parameter a can be continously varied between 0 and 1, and are therefore very useful as adjustable-contrast functions. 
//   However, they are more expensive to compute than the polynomial sigmoid flavors. 
//   The Double-Exponential Sigmoid approximates the Raised Inverted Cosine to within 1% when the parameter a is approximately 0.426.
float doubleExponentialSigmoid (float x, float a){
    float epsilon = 0.00001;
    float min_param_a = 0.0 + epsilon;
    float max_param_a = 1.0 - epsilon;
    a = min(max_param_a, max(min_param_a, a));
    a = 1.0-a; // for sensible results
    
    float y = 0.0;
    if (x<=0.5){
        y = (pow(2.0*x, 1.0/a))/2.0;
    } else {
        y = 1.0 - (pow(2.0*(1.0-x), 1.0/a))/2.0;
    }
    return y;
}

// The Logistic Sigmoid
//   The so-called "Logistic Curve" is an elegant sigmoidal function which is believed by many scientists to best represent the growth of organic populations and many other natural phenomena. 
//   In software engineering, it is often used for weighting signal-response functions in neural networks. 
//   In this implementation, the parameter a regulates the slope or "growth rate" of the sigmoid during its rising portion. 
//   When a=0, this version of the Logistic function collapses to the Identity Function (y=x). 
//   The Logistic Sigmoid has very natural rates of change, but is expensive to calculate due to the use of many exponential functions. 
float logisticSigmoid (float x, float a){
    // n.b.: this Logistic Sigmoid has been normalized.
    float epsilon = 0.0001;
    float min_param_a = 0.0 + epsilon;
    float max_param_a = 1.0 - epsilon;
    a = max(min_param_a, min(max_param_a, a));
    a = (1.0/(1.0-a) - 1.0);

    float A = 1.0 / (1.0 + exp(0.0 -((x-0.5)*a*2.0)));
    float B = 1.0 / (1.0 + exp(a));
    float C = 1.0 / (1.0 + exp(0.0-a)); 
    float y = (A-B)/(C-B);
    return y;
}





// ----- CIRCULAR & ELIPTICAL SHAPING FUNCTIONS -----
// From: http://www.flong.com/archive/texts/code/shapers_circ/

// Circular Interpolation: Ease-In and Ease-Out
//   A circular arc offers a quick and easy-to-code method for easing in or out of the unit square. 
//   The computational efficiency of the function is diminished by its use of a square root, however.
float circularEaseIn (float x){
    float y = 1.0 - sqrt(1.0 - x*x);
    return y;
}
//------------------------------
float circularEaseOut (float x){
    float y = sqrt(1.0 - pow(1.0 - x, 2.));
    return y;
}

// Double-Circle Seat
//   This shaping function is formed by the meeting of two circular arcs, which join with a horizontal tangent. 
//   The parameter a, in the range [0...1], governs the location of the curve's inflection point along the diagonal of the unit square.
float doubleCircleSeat (float x, float a){
    float min_param_a = 0.0;
    float max_param_a = 1.0;
    a = max(min_param_a, min(max_param_a, a)); 

    float y = 0.0;
    if (x<=a){
        y = sqrt(pow(a, 2.) - pow(x-a, 2.));
    } else {
        y = 1.0 - sqrt(pow(1.0-a, 2.) - pow(x-a, 2.));
    }
    return y;
}

// Double-Circle Sigmoid
//   This sigmoidal shaping function is formed by the meeting of two circular arcs, which join with a vertical tangent. 
//   The parameter a, in the range [0...1], governs the location of the curve's inflection point along the diagonal of the unit square.
float doubleCircleSigmoid (float x, float a){
    float min_param_a = 0.0;
    float max_param_a = 1.0;
    a = max(min_param_a, min(max_param_a, a)); 

    float y = 0.0;
    if (x<=a){
        y = a - sqrt(a*a - x*x);
    } else {
        y = a + sqrt(pow(1.0-a, 2.0) - pow(x-1.0, 2.0));
    }
    return y;
}

// Double-Elliptic Seat
//   This seat-shaped function is created by the joining of two elliptical arcs, and is a generalization of the Double-Circle Seat. 
//   The two arcs meet at the coordinate (a,b) with a horizontal tangent.
float doubleEllipticSeat (float x, float a, float b){
    float epsilon = 0.00001;
    float min_param_a = 0.0 + epsilon;
    float max_param_a = 1.0 - epsilon;
    float min_param_b = 0.0;
    float max_param_b = 1.0;
    a = max(min_param_a, min(max_param_a, a)); 
    b = max(min_param_b, min(max_param_b, b)); 

    float y = 0.;
    if (x<=a){
        y = (b/a) * sqrt(pow(a, 2.) - pow(x-a, 2.));
    } else {
        y = 1.- ((1.-b)/(1.-a))*sqrt(pow(1.-a, 2.) - pow(x-a, 2.));
    }
    return y;
}

// Double-Elliptic Sigmoid
//   This sigmoid-shaped function is created by the joining of two elliptical arcs, and is a generalization of the Double-Circle Sigmoid. 
//   The arcs meet at the coordinate (a, b) in the unit square with a vertical tangent. 
float doubleEllipticSigmoid (float x, float a, float b){
    float epsilon = 0.00001;
    float min_param_a = 0.0 + epsilon;
    float max_param_a = 1.0 - epsilon;
    float min_param_b = 0.0;
    float max_param_b = 1.0;
    a = max(min_param_a, min(max_param_a, a)); 
    b = max(min_param_b, min(max_param_b, b));
    
    float y = 0.;
    if (x<=a){
        y = b * (1. - (sqrt(pow(a, 2.) - pow(x, 2.))/a));
    } else {
        y = b + ((1.-b)/(1.-a))*sqrt(pow(1.-a, 2.) - pow(x-1., 2.));
    }
    return y;
}

// Double-Linear with Circular Fillet
//   This pattern joins two straight lines with a circular arc whose radius is adjustable. 
//   The user specifies the fillet's radius (with parameter c) and the coordinate in the unit square where the lines would otherwise intersect (with parameters a and b). 
//   This pattern is adapted from Robert D. Miller's "Joining Two Lines with a Circular Arc Fillet", which appears in Graphics Gems III.
float arcStartAngle;
float arcEndAngle;
float arcStartX,  arcStartY;
float arcEndX,    arcEndY;
float arcCenterX, arcCenterY;
float arcRadius;
// Line To Point
//   Return signed distance from line Ax + By + C = 0 to point P.
float linetopoint (float a, float b, float c, float ptx, float pty){
    float lp = 0.0;
    float d = sqrt((a*a)+(b*b));
    if (d != 0.0){
        lp = (a*ptx + b*pty + c)/d;
    }
    return lp;
}
// Compute Fillet Parameters
//   Compute the parameters of a circular arc 
//   fillet between lines L1 (p1 to p2) and
//   L2 (p3 to p4) with radius R.  
void computeFilletParameters (
    float p1x, float p1y, 
    float p2x, float p2y, 
    float p3x, float p3y, 
    float p4x, float p4y,
    float r){

    float c1   = p2x*p1y - p1x*p2y;
    float a1   = p2y-p1y;
    float b1   = p1x-p2x;
    float c2   = p4x*p3y - p3x*p4y;
    float a2   = p4y-p3y;
    float b2   = p3x-p4x;
    if ((a1*b2) == (a2*b1)){  /* Parallel or coincident lines */
        return;
    }

    float d1, d2;
    float mPx, mPy;
    mPx = (p3x + p4x)/2.0;
    mPy = (p3y + p4y)/2.0;
    d1 = linetopoint(a1,b1,c1,mPx,mPy);  /* Find distance p1p2 to p3 */
    if (d1 == 0.0) {
        return; 
    }
    mPx = (p1x + p2x)/2.0;
    mPy = (p1y + p2y)/2.0;
    d2 = linetopoint(a2,b2,c2,mPx,mPy);  /* Find distance p3p4 to p2 */
    if (d2 == 0.0) {
        return; 
    }

    float c1p, c2p, d;
    float rr = r;
    if (d1 <= 0.0) {
        rr= -rr;
    }
    c1p = c1 - rr*sqrt((a1*a1)+(b1*b1));  /* Line parallel l1 at d */
    rr = r;
    if (d2 <= 0.0){
        rr = -rr;
    }
    c2p = c2 - rr*sqrt((a2*a2)+(b2*b2));  /* Line parallel l2 at d */
    d = (a1*b2)-(a2*b1);

    float pCx = (c2p*b1-c1p*b2)/d; /* Intersect constructed lines */
    float pCy = (c1p*a2-c2p*a1)/d; /* to find center of arc */
    float pAx = 0.;
    float pAy = 0.;
    float pBx = 0.;
    float pBy = 0.;
    float dP,cP;

    dP = (a1*a1) + (b1*b1);        /* Clip or extend lines as required */
    if (dP != 0.0){
        cP = a1*pCy - b1*pCx;
        pAx = (-a1*c1 - b1*cP)/dP;
        pAy = ( a1*cP - b1*c1)/dP;
    }
    dP = (a2*a2) + (b2*b2);
    if (dP != 0.0){
        cP = a2*pCy - b2*pCx;
        pBx = (-a2*c2 - b2*cP)/dP;
        pBy = ( a2*cP - b2*c2)/dP;
    }

    float gv1x = pAx-pCx; 
    float gv1y = pAy-pCy;
    float gv2x = pBx-pCx; 
    float gv2y = pBy-pCy;

    float arcStart = float(atan(gv1y,gv1x)); 
    float arcAngle = 0.0;
    float dd = float(sqrt(((gv1x*gv1x)+(gv1y*gv1y)) * ((gv2x*gv2x)+(gv2y*gv2y))));
    if (dd != float(0.0)){
        arcAngle = (acos((gv1x*gv2x + gv1y*gv2y)/dd));
    } 
    float crossProduct = (gv1x*gv2y - gv2x*gv1y);
    if (crossProduct < 0.0){ 
        arcStart -= arcAngle;
    }

    float arc1 = arcStart;
    float arc2 = arcStart + arcAngle;
    if (crossProduct < 0.0){
        arc1 = arcStart + arcAngle;
        arc2 = arcStart;
    }

    arcCenterX    = pCx;
    arcCenterY    = pCy;
    arcStartAngle = arc1;
    arcEndAngle   = arc2;
    arcRadius     = r;
    arcStartX     = arcCenterX + arcRadius*cos(arcStartAngle);
    arcStartY     = arcCenterY + arcRadius*sin(arcStartAngle);
    arcEndX       = arcCenterX + arcRadius*cos(arcEndAngle);
    arcEndY       = arcCenterY + arcRadius*sin(arcEndAngle);
}
// Circular Fillet
float circularFillet (float x, float a, float b, float R){
    float epsilon = 0.00001;
    float min_param_a = 0.0 + epsilon;
    float max_param_a = 1.0 - epsilon;
    float min_param_b = 0.0 + epsilon;
    float max_param_b = 1.0 - epsilon;
    a = max(min_param_a, min(max_param_a, a)); 
    b = max(min_param_b, min(max_param_b, b)); 

    computeFilletParameters(0.,0., a,b, a,b, 1.,1.,  R);
    float t = 0.;
    float y = 0.;
    x = max(0., min(1., x));
    
    if (x <= arcStartX){
        t = x / arcStartX;
        y = t * arcStartY;
    } else if (x >= arcEndX){
        t = (x - arcEndX)/(1. - arcEndX);
        y = arcEndY + t*(1. - arcEndY);
    } else {
        if (x >= arcCenterX){
        y = arcCenterY - sqrt(pow(arcRadius, 2.) - pow(x-arcCenterX, 2.)); 
        } else{
        y = arcCenterY + sqrt(pow(arcRadius, 2.) - pow(x-arcCenterX, 2.)); 
        }
    }
    return y;
}

// Circular Arc Through a Given Point
//   This function defines a circular arc which passes through a user-specified point in the unit square. 
//   Unfortunately, not every location in the unit square lends itself to defining a circle which also is confined to the unit square; 
//   the user-supplied point must inhabit a zone close to the main (Identity) diagonal. 
//   This pattern is adapted from Paul Bourke's Equation of a Circle From 3 Points. 
float m_Centerx;
float m_Centery;
float m_dRadius;
// Is Perpendicular
bool IsPerpendicular(
    float pt1x, float pt1y,
    float pt2x, float pt2y,
    float pt3x, float pt3y) {
    // Check the given point are perpendicular to x or y axis 
    float yDelta_a = pt2y - pt1y;
    float xDelta_a = pt2x - pt1x;
    float yDelta_b = pt3y - pt2y;
    float xDelta_b = pt3x - pt2x;
    float epsilon = 0.000001;

    // checking whether the line of the two pts are vertical
    if (abs(xDelta_a) <= epsilon && abs(yDelta_b) <= epsilon){
        return false;
    }
    if (abs(yDelta_a) <= epsilon){
        return true;
    }
    else if (abs(yDelta_b) <= epsilon){
        return true;
    }
    else if (abs(xDelta_a)<= epsilon){
        return true;
    }
    else if (abs(xDelta_b)<= epsilon){
        return true;
    }
    else return false;
}
// Calculate Circle from 3 Points
void calcCircleFrom3Points (
    float pt1x, float pt1y,
    float pt2x, float pt2y,
    float pt3x, float pt3y) {
    float yDelta_a = pt2y - pt1y;
    float xDelta_a = pt2x - pt1x;
    float yDelta_b = pt3y - pt2y;
    float xDelta_b = pt3x - pt2x;
    float epsilon = 0.000001;

    if (abs(xDelta_a) <= epsilon && abs(yDelta_b) <= epsilon){
        m_Centerx = 0.5*(pt2x + pt3x);
        m_Centery = 0.5*(pt1y + pt2y);
        m_dRadius = sqrt(pow(m_Centerx-pt1x, 2.) + pow(m_Centery-pt1y, 2.));
        return;
    }

    // IsPerpendicular() assure that xDelta(s) are not zero
    float aSlope = yDelta_a / xDelta_a; 
    float bSlope = yDelta_b / xDelta_b;
    if (abs(aSlope-bSlope) <= epsilon){	
        // checking whether the given points are colinear. 	
        return;
    }

    // calc center
    m_Centerx = (
        aSlope*bSlope*(pt1y - pt3y) + 
        bSlope*(pt1x + pt2x) - 
        aSlope*(pt2x+pt3x) )
        /(2.* (bSlope-aSlope) );
    m_Centery = -1.*(m_Centerx - (pt1x+pt2x)/2.)/aSlope +  (pt1y+pt2y)/2.;
    m_dRadius = sqrt(pow(m_Centerx-pt1x, 2.) + pow(m_Centery-pt1y, 2.));
    return;
}
// Circular Arc Through a Point
float circularArcThroughAPoint (float x, float a, float b){  
    float epsilon = 0.00001;
    float min_param_a = 0.0 + epsilon;
    float max_param_a = 1.0 - epsilon;
    float min_param_b = 0.0 + epsilon;
    float max_param_b = 1.0 - epsilon;
    a = min(max_param_a, max(min_param_a, a));
    b = min(max_param_b, max(min_param_b, b));
    x = min(1.0-epsilon, max(0.0+epsilon, x));
    
    float pt1x = 0.;
    float pt1y = 0.;
    float pt2x = a;
    float pt2y = b;
    float pt3x = 1.;
    float pt3y = 1.;

    if      (!IsPerpendicular(pt1x,pt1y, pt2x,pt2y, pt3x,pt3y))		
        calcCircleFrom3Points (pt1x,pt1y, pt2x,pt2y, pt3x,pt3y);	
    else if (!IsPerpendicular(pt1x,pt1y, pt3x,pt3y, pt2x,pt2y))		
        calcCircleFrom3Points (pt1x,pt1y, pt3x,pt3y, pt2x,pt2y);	
    else if (!IsPerpendicular(pt2x,pt2y, pt1x,pt1y, pt3x,pt3y))		
        calcCircleFrom3Points (pt2x,pt2y, pt1x,pt1y, pt3x,pt3y);	
    else if (!IsPerpendicular(pt2x,pt2y, pt3x,pt3y, pt1x,pt1y))		
        calcCircleFrom3Points (pt2x,pt2y, pt3x,pt3y, pt1x,pt1y);	
    else if (!IsPerpendicular(pt3x,pt3y, pt2x,pt2y, pt1x,pt1y))		
        calcCircleFrom3Points (pt3x,pt3y, pt2x,pt2y, pt1x,pt1y);	
    else if (!IsPerpendicular(pt3x,pt3y, pt1x,pt1y, pt2x,pt2y))		
        calcCircleFrom3Points (pt3x,pt3y, pt1x,pt1y, pt2x,pt2y);	
    else { 
        return 0.;
    }

    // constrain
    if ((m_Centerx > 0.) && (m_Centerx < 1.)){
        if (a < m_Centerx){
        m_Centerx = 1.;
        m_Centery = 0.;
        m_dRadius = 1.;
        } else {
        m_Centerx = 0.;
        m_Centery = 1.;
        m_dRadius = 1.;
        }
    }
    
    float y = 0.;
    if (x >= m_Centerx){
        y = m_Centery - sqrt(pow(m_dRadius, 2.) - pow(x-m_Centerx, 2.)); 
    } else {
        y = m_Centery + sqrt(pow(m_dRadius, 2.) - pow(x-m_Centerx, 2.)); 
    }
    return y;
}





// ----- BEZIER & OTHER PARAMETRIC SHAPING FUNCTIONS -----
// From: https://www.flong.com/archive/texts/code/shapers_bez/

// Quadratic Bezier
//   This function defines a 2nd-order (quadratic) Bezier curve with a single user-specified spline control point (at the coordinate a,b) in the unit square.
//   This function is guaranteed to have the same entering and exiting slopes as the Double-Linear Interpolator. 
//   Put another way, this curve allows the user to precisely specify its rate of change at its endpoints in the unit square. 
float quadraticBezier (float x, float a, float b){
    // adapted from BEZMATH.PS (1993)
    // by Don Lancaster, SYNERGETICS Inc. 
    // http://www.tinaja.com/text/bezmath.html

    float epsilon = 0.00001;
    a = max(0., min(1., a)); 
    b = max(0., min(1., b)); 
    if (a == 0.5){
        a += epsilon;
    }
    
    // solve t from x (an inverse operation)
    float om2a = 1. - 2.*a;
    float t = (sqrt(a*a + om2a*x) - a)/om2a;
    float y = (1.-2.*b)*(t*t) + (2.*b)*t;
    return y;
}

// Cubic Bezier
//   This extremely flexible curve is used in as a signal-shaping function, which requires the user to specify two locations in the unit square (at the coordinates a,b and c,d) as its control points. 
//   By setting the two control points (a,b) and (c,d) to various locations, the Bezier curve can be used to produce sigmoids, seat-shaped functions, ease-ins and ease-outs.
//   Bezier curves are customarily defined in such a way that y and x are both functions of another variable t. 
//   In order to obtain y as a function of x, it is necessary to first solve for t using successive approximation, making the code longer than one might first expect. 
//   The implementation here is adapted from the Bezmath Postscript library by Don Lancaster. 
// Helper functions:
float slopeFromT (float t, float A, float B, float C){
    float dtdx = 1.0/(3.0*A*t*t + 2.0*B*t + C); 
    return dtdx;
}
float xFromT (float t, float A, float B, float C, float D){
    float x = A*(t*t*t) + B*(t*t) + C*t + D;
    return x;
}
float yFromT (float t, float E, float F, float G, float H){
    float y = E*(t*t*t) + F*(t*t) + G*t + H;
    return y;
}
// Cubic Bezier
float cubicBezier (float x, float a, float b, float c, float d){
    float y0a = 0.00; // initial y
    float x0a = 0.00; // initial x 
    float y1a = b;    // 1st influence y   
    float x1a = a;    // 1st influence x 
    float y2a = d;    // 2nd influence y
    float x2a = c;    // 2nd influence x
    float y3a = 1.00; // final y 
    float x3a = 1.00; // final x 

    float A =   x3a - 3.*x2a + 3.*x1a - x0a;
    float B = 3.*x2a - 6.*x1a + 3.*x0a;
    float C = 3.*x1a - 3.*x0a;   
    float D =   x0a;

    float E =   y3a - 3.*y2a + 3.*y1a - y0a;    
    float F = 3.*y2a - 6.*y1a + 3.*y0a;             
    float G = 3.*y1a - 3.*y0a;             
    float H =   y0a;

    // Solve for t given x (using Newton-Raphelson), then solve for y given t.
    // Assume for the first guess that t = x.
    float currentt = x;
    const int nRefinementIterations = 5;
    for (int i=0; i < nRefinementIterations; i++){
        float currentx = xFromT (currentt, A,B,C,D); 
        float currentslope = slopeFromT (currentt, A,B,C);
        currentt -= (currentx - x)*(currentslope);
        currentt = clamp(currentt, 0.,1.);
    } 

    float y = yFromT (currentt,  E,F,G,H);
    return y;
}

// Cubic Bezier (Nearly) Through Two Given Points
//   This shaping function asks the user to specify two points in the unit square. 
//   The algorithm then attempts to generate a curve which passes through these points as closely as possible. 
//   The curves are not guaranteed to pass through the two points, but come quite close in most instances. 
//   The method is adapted from Don Lancaster. 
// Helper functions. 
float B0 (float t){
    return (1.-t)*(1.-t)*(1.-t);
}
float B1 (float t){
    return  3.*t* (1.-t)*(1.-t);
}
float B2 (float t){
    return 3.*t*t* (1.-t);
}
float B3 (float t){
    return t*t*t;
}
float  findx (float t, float x0, float x1, float x2, float x3){
    return x0*B0(t) + x1*B1(t) + x2*B2(t) + x3*B3(t);
}
float  findy (float t, float y0, float y1, float y2, float y3){
    return y0*B0(t) + y1*B1(t) + y2*B2(t) + y3*B3(t);
}
float cubicBezierNearlyThroughTwoPoints(
    float x, float a, float b, float c, float d){

    float y = 0.;
    float epsilon = 0.00001;
    float min_param_a = 0.0 + epsilon;
    float max_param_a = 1.0 - epsilon;
    float min_param_b = 0.0 + epsilon;
    float max_param_b = 1.0 - epsilon;
    a = max(min_param_a, min(max_param_a, a));
    b = max(min_param_b, min(max_param_b, b));

    float x0 = 0.;  
    float y0 = 0.;
    float x4 = a;  
    float y4 = b;
    float x5 = c;  
    float y5 = d;
    float x3 = 1.;  
    float y3 = 1.;
    float x1,y1,x2,y2; // to be solved.

    // arbitrary but reasonable 
    // t-values for interior control points
    float t1 = 0.3;
    float t2 = 0.7;

    float B0t1 = B0(t1);
    float B1t1 = B1(t1);
    float B2t1 = B2(t1);
    float B3t1 = B3(t1);
    float B0t2 = B0(t2);
    float B1t2 = B1(t2);
    float B2t2 = B2(t2);
    float B3t2 = B3(t2);

    float ccx = x4 - x0*B0t1 - x3*B3t1;
    float ccy = y4 - y0*B0t1 - y3*B3t1;
    float ffx = x5 - x0*B0t2 - x3*B3t2;
    float ffy = y5 - y0*B0t2 - y3*B3t2;

    x2 = (ccx - (ffx*B1t1)/B1t2) / (B2t1 - (B1t1*B2t2)/B1t2);
    y2 = (ccy - (ffy*B1t1)/B1t2) / (B2t1 - (B1t1*B2t2)/B1t2);
    x1 = (ccx - x2*B2t1) / B1t1;
    y1 = (ccy - y2*B2t1) / B1t1;

    x1 = max(0.+epsilon, min(1.-epsilon, x1));
    x2 = max(0.+epsilon, min(1.-epsilon, x2));

    // Note that this function also requires cubicBezier()!
    y = cubicBezier (x, x1,y1, x2,y2);
    y = max(0., min(1., y));
    return y;
}





// ----- INIGO QUILES SHAPING FUNCTIONS -----
//   Functions from Iñigo Quiles
//   www.iquilezles.org/www/articles/functions/functions.htm

// Impulse
float impulse( float k, float x ){
    float h = k*x;
    return h*exp(1.0-h);
}

// Cubic Pulse
float cubicPulse( float c, float w, float x ){
    x = abs(x - c);
    if( x>w ) return 0.0;
    x /= w;
    return 1.0 - x*x*(3.0-2.0*x);
}

// ExpStep
float expStep( float x, float k, float n ){
    return exp( -k*pow(x,n) );
}

// Parabola
float parabola( float x, float k ){
    return pow( 4.0*x*(1.0-x), k );
}

// Pcurve
float pcurve( float x, float a, float b ){
    float k = pow(a+b,a+b) / (pow(a,a)*pow(b,b));
    return k * pow( x, a ) * pow( 1.0-x, b );
}
